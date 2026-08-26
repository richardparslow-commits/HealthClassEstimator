/* =========================================================================
 * HealthClassEstimator — Rule engine
 * -------------------------------------------------------------------------
 * Flow (per the build spec):
 *   1. Screen postpone / likely-decline triggers first (gates).
 *   2. Calculate the best possible class from each rule module.
 *   3. Take the worst applicable ceiling as the provisional class.
 *   4. Apply explicit carrier credits only where the guide allows them
 *      (flagged as "possible credit review", never auto-applied).
 *   5. Produce flags: needs_aps, needs_exam, likely_table, possible_decline,
 *      manual_review, missing_material_data.
 *   6. Estimate confidence from evidence completeness.
 *
 * Outputs are preliminary and non-binding; final decision is carrier
 * underwriting. This tool never says "approved" or "declined" as a fact.
 * ========================================================================= */
"use strict";

const Engine = (() => {

  /* ---------- helpers -------------------------------------------------- */

  const has = (obj, key) => obj && Object.prototype.hasOwnProperty.call(obj, key) && obj[key] !== null && obj[key] !== undefined && obj[key] !== "";

  // accept both boolean true and string "yes" for checkbox-derived flags
  const isYes = (v) => v === true || v === "yes";
  // explicit negative — false (legacy test-harness booleans) or the string "no"
  const isNo = (v) => v === false || v === "no";

  function classWorseThan(a, b) {
    return CLASS_INDEX[a] > CLASS_INDEX[b];
  }

  function worstOf(a, b) {
    return classWorseThan(a, b) ? a : b;
  }

  /* ---------- build evaluation ---------------------------------------- */

  /**
   * Evaluate build against the carrier's height/weight chart.
   * Returns { klass, band, adjustedWeight, flags: [] , detail }
   */
  function evalBuild(rules, d) {
    const flags = [];

    /* ---- BMI-based build (Transamerica blended BMI chart) ------------ */
    if (rules.build.type === "bmi") {
      if (!has(d, "heightIn") || !has(d, "weightLb")) {
        return { klass: null, missing: true, flags, detail: "Height or weight not provided." };
      }
      const heightIn = Number(d.heightIn);
      const weight = Number(d.weightLb);
      if (heightIn <= 0 || weight <= 0) {
        return { klass: "manual_review", flags: [...flags, "manual_review"], detail: "Invalid height or weight." };
      }
      const bmi = weight / (heightIn * heightIn) * 703;
      const age = d.age ? Number(d.age) : null;
      const groups = rules.build.bmiBands || [];
      const group = groups.find(g => (g.ageMin === undefined || age >= g.ageMin) && (g.ageMax === undefined || age <= g.ageMax)) || groups[0];
      if (!group) return { klass: "manual_review", flags: [...flags, "manual_review"], detail: "No BMI chart for this age." };
      let match = null;
      for (const b of group.bands) {
        if (bmi >= b.min && bmi <= b.max) { match = b; break; }
      }
      if (!match) match = group.bands[group.bands.length - 1];
      const rounded = Math.round(bmi * 100) / 100;
      const tableNote = match.table ? ` (Table ${match.table})` : "";
      return {
        klass: match.klass,
        tableLetter: match.table || null,
        bmi: rounded,
        bandName: match.label,
        flags: match.klass === "decline" ? [...flags, "bmi_decline"] : flags,
        detail: `BMI ${rounded} (${heightIn}\" / ${weight} lb, ${group.label}) → ${match.label}${tableNote}. ${rules.build.rules.note}`
      };
    }

    /* ---- Height/weight chart build (Banner, Foresters) -------------- */
    const chart = rules.build.chart;
    if (!has(d, "heightIn") || !has(d, "weightLb")) {
      return { klass: null, missing: true, flags, detail: "Height or weight not provided." };
    }
    const rawHeight = Number(d.heightIn);
    const heightIn = Math.ceil(rawHeight * 2) / 2; // keep half inches; chart lookup below rounds up
    const lookupHeight = Math.ceil(heightIn);     // half-inch rounds up to next inch
    if (lookupHeight < rules.build.rules.minHeightIn || lookupHeight > rules.build.rules.maxHeightIn) {
      return { klass: "manual_review", flags: [...flags, "manual_review"], detail: `Height outside the carrier build chart (${rules.build.rules.minHeightIn}"-${rules.build.rules.maxHeightIn}"). Manual underwriting review required.` };
    }
    const rawBand = chart[lookupHeight];
    if (!rawBand) {
      return { klass: "manual_review", flags: [...flags, "manual_review"], detail: "Height not found in build chart." };
    }
    // Sex-specific chart shape (e.g., F&G Quantum: male/female Preferred & Standard
    // columns plus sex-neutral adult minimum and Table D maximum weights).
    let band = rawBand;
    if (rawBand.male || rawBand.female) {
      const sexKey = d.sex === "female" ? "female" : "male";
      band = Object.assign({}, rawBand, rawBand[sexKey]);
      band._sex = sexKey;
    }
    // Carrier age-based threshold adjustment (single step, e.g., F&G Quantum:
    // ages 51-60 add 5 lb; or multiple steps, e.g., F&G Pathsetter: +5 lb at
    // 51-65 and +10 lb at 66+).
    const ageNow = d.age ? Number(d.age) : null;
    const ageAddSteps = rules.build.rules.ageAddLbs;
    const steps = Array.isArray(ageAddSteps) ? ageAddSteps : (ageAddSteps ? [ageAddSteps] : []);
    if (ageNow !== null) {
      for (const step of steps) {
        if (ageNow >= step.ageMin && ageNow <= step.ageMax) {
          ["pp", "p", "sp", "stdCredit", "std", "tableMax", "min"].forEach(k => {
            if (band[k] !== undefined) band[k] += step.add;
          });
        }
      }
    }

    let adjustedWeight = Number(d.weightLb);
    let weightNote = "";
    if (rules.build.rules.applyWeightLossAdjustment !== false && has(d, "weightOneYearAgoLb") && d.weightIntentional) {
      const change = Number(d.weightOneYearAgoLb) - adjustedWeight;
      if (change > 20) {
        adjustedWeight = adjustedWeight + change / 2;
        weightNote = `Intentional loss of ${change} lb in the past year: half of the loss (${(change / 2).toFixed(0)} lb) added back per the weight-loss adjustment rule. Adjusted weight: ${adjustedWeight.toFixed(0)} lb.`;
      }
    }
    if (has(d, "weightChangeUnintentional") && d.weightChangeUnintentional) {
      flags.push("manual_review");
      weightNote += " Unintentional weight change flagged for medical/manual review; no automatic weight adjustment applied.";
    }

    // BMI screening flag
    const bmi = adjustedWeight / (lookupHeight * lookupHeight) * 703;
    const bmiLow = bmi < rules.build.rules.belowChartMin;

    const chartMin = band.min !== undefined ? band.min : (rules.build.rules.chartMinWeight !== undefined ? rules.build.rules.chartMinWeight : 89);
    let klass = null;
    let bandName = "";
    let tableRating = null;
    if (bmiLow || adjustedWeight < chartMin) {
      klass = "manual_review";
      bandName = "below chart minimum";
      flags.push("manual_review");
    } else if (adjustedWeight <= band.pp) {
      klass = "preferred_plus"; bandName = "Preferred Plus";
    } else if (adjustedWeight <= band.p) {
      klass = "preferred"; bandName = "Preferred";
    } else if (adjustedWeight <= band.sp) {
      klass = "standard_plus"; bandName = "Standard Plus";
    } else if (adjustedWeight <= band.stdCredit) {
      klass = "standard"; bandName = "Standard (possible credit)";
    } else if (adjustedWeight <= band.std) {
      klass = "standard"; bandName = "Standard (no build credit)";
      flags.push("no_build_credit");
    } else {
      // Carrier-published substandard table bands (e.g., Mutual of Omaha
      // build chart: Table 1 (+25 lb) through Table 12 (+300 lb))
      const tBands = rules.build.tableBands || [];
      let tableHit = null;
      for (const tb of tBands) {
        if (band[tb.key] !== undefined && adjustedWeight <= band[tb.key]) { tableHit = tb; break; }
      }
      if (tableHit) {
        klass = "table";
        bandName = tableHit.label || `Table ${tableHit.table}`;
        tableRating = tableHit.table;
      } else if (band.tableMax !== undefined && adjustedWeight <= band.tableMax) {
        // Carrier publishes a substandard ceiling instead of a table ladder
        // (e.g., F&G Quantum: Table D/200%; F&G Pathsetter: Table H/300%).
        klass = "table";
        bandName = rules.build.rules.tableCeilingLabel || "substandard (Table A-D / 200%)";
        tableRating = rules.build.rules.tableCeilingRating || "A-D";
      } else {
        klass = "substandard_review";
        bandName = "above the highest published weight";
        flags.push("substandard_build", "manual_review");
      }
    }

    return {
      klass,
      bandName,
      tableRating,
      adjustedWeight: Math.round(adjustedWeight),
      bmi: Math.round(bmi * 10) / 10,
      bmiLow,
      weightNote,
      flags,
      detail: `${bandName} band at ${lookupHeight}" (raw height ${rawHeight}", rounded up)${band._sex ? ", " + band._sex + " chart" : ""}. ${weightNote}`
    };
  }

  /* ---------- nicotine evaluation ------------------------------------- */

  function monthsSince(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  }

  /**
   * Returns { tobacco: boolean, klass: classIndexName|null, detail }
   */
  function evalNicotine(rules, d) {
    if (!has(d, "usedNicotine")) {
      return { tobacco: null, klass: null, missing: true, detail: "Nicotine use not disclosed." };
    }
    if (isNo(d.usedNicotine)) {
      return { tobacco: false, klass: "preferred_plus", detail: "No nicotine use disclosed." };
    }
    const ms = monthsSince(d.nicotineLastUse);
    const months = ms === null ? null : Math.floor(ms);
    const isTobacco = isYes(d.usedNicotine) && (months === null || months < rules.nicotine.tobaccoLookbackMonths);

    // Cigar exception
    if (d.nicotineProduct === "cigar" && has(d, "cigarPerMonth")) {
      const perMonth = Number(d.cigarPerMonth);
      if (perMonth <= rules.nicotine.cigarException.maxPerMonth && d.cotinineNegative && !d.cigarComorbid) {
        return { tobacco: false, klass: "preferred_plus", cigarException: true, detail: "Occasional cigar exception applies (≤1/month, negative cotinine, no comorbid diabetes/asthma)." };
      }
    }

    if (!isTobacco && months !== null) {
      // Non-tobacco now; find the most favorable class whose lookback is satisfied
      const withMonths = rules.nicotine.classes.map(c => ({
        klass: c.klass,
        lookbackMonths: c.lookbackMonths !== undefined ? c.lookbackMonths : (c.lookbackYears !== undefined ? c.lookbackYears * 12 : 12)
      }));
      const sorted = [...withMonths].sort((a, b) => b.lookbackMonths - a.lookbackMonths);
      let best = "standard"; // default
      for (const c of sorted) {
        if (months >= c.lookbackMonths) { best = c.klass; break; }
      }
      return { tobacco: false, klass: best, detail: `Last nicotine use ${months} months ago. Best non-tobacco class by lookback: ${best}.` };
    }
    if (months === null) {
      return { tobacco: true, klass: null, missing: true, detail: "Nicotine use disclosed but last-use date missing — treat as tobacco pending verification." };
    }
    return { tobacco: true, klass: "tobacco", detail: `Nicotine used within the last 12 months (${months} months ago) — tobacco class applies.` };
  }

  /* ---------- blood pressure ------------------------------------------ */

  /* Carrier rules may express a threshold as a plain object or as age-band arrays (Foresters). */
  function ageBand(bands, age) {
    if (Array.isArray(bands)) {
      if (age === null || age === undefined) return null;
      return bands.find(b => age >= b.ageMin && age <= b.ageMax) || null;
    }
    return bands;
  }

  function evalBP(rules, d) {
    if (!has(d, "bpSys") || !has(d, "bpDia")) {
      return { klass: null, missing: true, detail: "Blood pressure not provided." };
    }
    const sys = Number(d.bpSys), dia = Number(d.bpDia);
    const age = d.age ? Number(d.age) : null;
    let klass = null;
    const order = ["preferred_plus", "preferred", "standard_plus", "standard"];
    for (const k of order) {
      const t = ageBand(rules.bp[k], age);
      if (t && sys <= t.sys && dia <= t.dia) { klass = k; break; }
    }
    if (!klass) {
      const st = ageBand(rules.bp.standard, age);
      const stdText = st ? `${st.sys}/${st.dia}` : "standard limits";
      return { klass: "bp_outside", detail: `BP ${sys}/${dia} exceeds Standard maximum (${stdText}) — substandard/cardiovascular review.` };
    }
    return { klass, detail: `BP ${sys}/${dia} supports ${klass}.` };
  }

  /* ---------- cholesterol --------------------------------------------- */

  function evalCholesterol(rules, d) {
    if (!has(d, "cholTotal") && !has(d, "cholHdl")) {
      return { klass: null, missing: true, detail: "Cholesterol not provided." };
    }
    const total = has(d, "cholTotal") ? Number(d.cholTotal) : null;
    const hdl = has(d, "cholHdl") ? Number(d.cholHdl) : null;
    const ratio = (total !== null && hdl) ? total / hdl : null;
    const age = d.age ? Number(d.age) : null;
    const totalMin = rules.cholesterol.totalMin !== undefined ? rules.cholesterol.totalMin : (rules.cholesterol.minUntreated || null);
    const totalMaxGlobal = rules.cholesterol.totalMax !== undefined ? rules.cholesterol.totalMax : null;
    let klass = null;
    const order = ["preferred_plus", "preferred", "standard_plus", "standard"];
    for (const k of order) {
      // Skip classes the carrier does not publish (a missing class must not
      // pass through as if it had no thresholds)
      const hasTotalBand = rules.cholesterol.total ? rules.cholesterol.total[k] !== undefined : false;
      const hasRatioBand = rules.cholesterol.ratio ? rules.cholesterol.ratio[k] !== undefined : false;
      if (!hasTotalBand && !hasRatioBand) continue;
      let ok = true;
      const totalBand = ageBand(rules.cholesterol.total ? rules.cholesterol.total[k] : null, age);
      // totalBand may be a plain number (Banner/Transamerica) or {max} (Foresters band)
      const totalMax = totalMaxGlobal !== null ? totalMaxGlobal : (typeof totalBand === "number" ? totalBand : (totalBand ? totalBand.max : null));
      if (total !== null) {
        if (totalMin !== null && total < totalMin) ok = false;
        if (totalMax !== null && total > totalMax) ok = false;
      }
      const ratioBand = ageBand(rules.cholesterol.ratio ? rules.cholesterol.ratio[k] : null, age);
      const ratioMax = ratioBand ? (typeof ratioBand === "number" ? ratioBand : ratioBand.max) : (rules.cholesterol.ratio && rules.cholesterol.ratio[k] !== undefined && !Array.isArray(rules.cholesterol.ratio[k]) && typeof rules.cholesterol.ratio[k] === "number" ? rules.cholesterol.ratio[k] : null);
      if (ratio !== null && ratioMax !== null && ratio > ratioMax) ok = false;
      if (ok) { klass = k; break; }
    }
    if (!klass) {
      return { klass: "lipids_outside", detail: `Cholesterol ${total || "n/a"} / HDL ${hdl || "n/a"} (ratio ${ratio === null ? "n/a" : ratio.toFixed(1)}) exceeds Standard limits.` };
    }
    return { klass, detail: `Cholesterol ${total || "n/a"} / HDL ${hdl || "n/a"} (ratio ${ratio === null ? "n/a" : ratio.toFixed(1)}) supports ${klass}.` };
  }

  /* ---------- driving -------------------------------------------------- */

  function evalDriving(rules, d) {
    if (!has(d, "movingViolations3yr")) {
      return { klass: null, missing: true, detail: "Driving history not provided." };
    }
    const mv = Number(d.movingViolations3yr);
    const serious = d.seriousDriving ? d.seriousDrivingYears : null; // years since last DUI/reckless/suspension
    let klass = null;
    const order = ["preferred_plus", "preferred", "standard_plus", "standard"];
    for (const k of order) {
      const t = rules.driving[k];
      if (!t) continue;
      let ok = true;
      if (t.maxViolations3yr !== undefined) {
        // Banner shape
        if (mv > t.maxViolations3yr) ok = false;
        if (d.seriousDriving && (serious === null || serious < t.cleanYears)) ok = false;
      } else {
        // Foresters shape: duiCleanYears + maxViolations over violationsYears
        if (d.seriousDriving && (serious === null || serious < t.duiCleanYears)) ok = false;
        if (t.violationsYears >= 3 && mv > t.maxViolations) ok = false;
      }
      if (ok) { klass = k; break; }
    }
    if (!klass) {
      return { klass: "driving_outside", detail: `Driving history (${mv} moving violations; serious violation within ${serious === null ? "unknown" : serious + " yr"}) exceeds Standard limits.` };
    }
    return { klass, detail: `Driving history supports ${klass}.` };
  }

  /* ---------- family history ------------------------------------------ */

  function evalFamilyHistory(rules, d) {
    if (!has(d, "famCardio")) {
      return { klass: null, missing: true, detail: "Family history not provided." };
    }
    const f = d.famCardio; // "none" | "parent" | "parent_sibling" | "multiple"
    const age = d.age ? Number(d.age) : null;
    const tobacco = isNo(d.usedNicotine);
    // Over-70 non-tobacco: CAD family history disregarded (Banner rule)
    const disregardBanner = rules.id === "banner" && age !== null && age > 70 && tobacco;
    // Carrier-published age at which family history stops applying (e.g., MOO: age 60+)
    const disregardAge = rules.familyHistory && rules.familyHistory.disregardAge;
    const disregardCarrier = disregardAge && age !== null && age >= disregardAge;
    if (disregardBanner) {
      return { klass: "preferred_plus", detail: "Family CAD history disregarded (applicant over 70, non-tobacco)." };
    }
    if (disregardCarrier) {
      return { klass: "preferred_plus", detail: `Family history disregarded (applicant age ${age}, at or above the carrier's ${disregardAge}+ threshold).` };
    }
    const mapping = (rules.familyHistory && rules.familyHistory.mapping) || { none: "preferred_plus", parent: "preferred", parent_sibling: "standard_plus", multiple: "standard" };
    const klass = mapping[f] || "standard";
    return { klass, detail: `Family history (${f}) supports ${klass}.` };
  }

  /* ---------- medical history ----------------------------------------- */

  function evalMedical(rules, d) {
    const conds = d.conditions || [];
    if (!conds.length) {
      return { klass: "preferred_plus", details: ["No medical conditions disclosed."] };
    }
    const details = [];
    let worst = "preferred_plus";
    let postpone = [];
    let decline = [];

    for (const c of conds) {
      const meta = (rules.medicalCeilings || []).find(m => m.id === c.id);
      if (!meta) continue;
      const status = c.status || "current";
      const severity = c.severity || "mild";
      const control = c.control || "good";

      if (meta.postpone) {
        // postpone applies only when explicitly indicated (recent/unstable/timing flag)
        if (isYes(c.postponeTrigger)) {
          postpone.push({ id: c.id, text: `${meta.name}: ${meta.postpone}` });
        }
      }
      if (meta.decline) {
        if (isYes(c.declineTrigger)) {
          decline.push({ id: c.id, text: `${meta.name}: ${meta.decline}` });
        }
      }

      // Determine ceiling for this condition
      let ceiling = null;
      if (meta.ceilings && meta.ceilings.length) {
        if (meta.id === "diabetes") {
          const onset = has(c, "onsetAge") ? Number(c.onsetAge) : null;
          const a1c = has(c, "a1c") ? Number(c.a1c) : null;
          const dm = rules.diabetes || null;
          // Carrier may publish a stricter A1c decline threshold (e.g., F&G: A1c 7 or above within the last year)
          if (a1c !== null && (dm && dm.a1cDeclineMin !== undefined ? a1c >= dm.a1cDeclineMin : a1c > 10)) {
            decline.push({ id: c.id, text: `Diabetes A1c ${a1c} ${dm && dm.a1cDeclineMin !== undefined ? "≥ " + dm.a1cDeclineMin : "> 10"} — decline/postpone screen.` });
            ceiling = "decline";
          } else if (c.complications === "yes") {
            decline.push({ id: c.id, text: "Significant diabetes complications — decline/postpone screen." });
            ceiling = "decline";
          } else if (dm && dm.juvenileOnsetDeclineAge && onset !== null && onset < dm.juvenileOnsetDeclineAge) {
            // Carrier-published juvenile-onset decline (e.g., National Life:
            // diabetes diagnosed prior to age 20 is on the uninsurable list).
            decline.push({ id: c.id, text: `Juvenile-onset diabetes (diagnosed at age ${onset}, before ${dm.juvenileOnsetDeclineAge}) — decline.` });
            ceiling = "decline";
          } else if (dm) {
            // carrier-published type model (e.g., MOO: Type 1 -> Table 2-8, Type 2 -> Standard-Table 8)
            const isType1 = c.type === "type1" || (onset !== null && onset < 20);
            ceiling = isType1 ? (dm.type1Ceiling || "table") : (dm.type2Ceiling || "standard");
            details.push(`Diabetes: ${isType1 ? "Type 1 (or onset before age 20)" : "Type 2"} — ${ceiling} best case per the impairment table.`);
          } else if (onset !== null && onset >= 50 && isNo(d.usedNicotine) && control === "good") {
            ceiling = "standard_plus";
          } else if (onset !== null && onset >= 50) {
            ceiling = "standard_plus"; // still the ceiling, but flagged
            details.push(`Diabetes: onset ${onset} — verify control; Standard Plus ceiling with good control.`);
          } else {
            ceiling = "standard";
            details.push(`Diabetes: onset before 50 — below the Standard Plus ceiling; review individually.`);
          }
          if (c.insulin === "yes" && c.tobaccoCurrent) {
            // tobacco + insulin diabetes is heavily rated
            ceiling = worstOf(ceiling || "standard", "table");
          }
        } else if (meta.id === "anxiety" || meta.id === "depression") {
          if (severity === "mild" && control === "good" && (c.medCount === 0 || (c.medCount === 1 && status === "current"))) {
            ceiling = "preferred_plus";
          } else if (severity === "mild" && control === "good" && c.medCount === 1) {
            ceiling = "preferred";
          } else {
            ceiling = "standard";
          }
        } else if (meta.id === "asthma") {
          if (severity === "mild" && c.medCount <= 1) ceiling = "preferred_plus";
          else if (severity === "mild" && c.medCount <= 2) ceiling = "preferred";
          else ceiling = "standard";
        } else if (meta.id === "sleep_apnea") {
          if ((severity === "mild" || severity === "moderate") && control === "good" && !c.residualSymptoms) ceiling = "preferred";
          else ceiling = "standard";
        } else if (meta.id === "skin_cancer") {
          ceiling = "preferred_plus";
        } else if (meta.id === "other_cancer") {
          const cm = rules.conditionModels && rules.conditionModels.other_cancer;
          const resolvedYears = c.resolvedYears !== "" && c.resolvedYears !== null && c.resolvedYears !== undefined ? Number(c.resolvedYears) : null;
          if (c.recurrence) { postpone.push({ id: c.id, text: "Cancer recurrence — contact underwriting before submitting." }); ceiling = "postpone"; }
          else if (cm && cm.declineWithinYears && resolvedYears !== null && resolvedYears < cm.declineWithinYears) {
            decline.push({ id: c.id, text: `Cancer resolved only ${resolvedYears} years ago — within the carrier's ${cm.declineWithinYears}-year decline window.` }); ceiling = "decline";
          }
          else if (cm && cm.waitYears && resolvedYears !== null && resolvedYears < cm.waitYears) {
            postpone.push({ id: c.id, text: `Cancer resolved only ${resolvedYears} years ago — carrier wait-out is ${cm.waitYears} years.` }); ceiling = "postpone";
          }
          else if (c.treatedWithin12mo) { postpone.push({ id: c.id, text: "Cancer diagnosed/treated within 12 months — contact underwriting before submitting." }); ceiling = "postpone"; }
          else if (cm && cm.afterCeiling) ceiling = cm.afterCeiling;
          else ceiling = "standard_plus";
        } else if (meta.id === "bipolar") {
          if (c.onsetWithin1yr) { postpone.push({ id: c.id, text: "Bipolar diagnosed within the last year." }); ceiling = "postpone"; }
          else if (c.suicide10yr) { decline.push({ id: c.id, text: "Suicide attempt within 10 years." }); ceiling = "decline"; }
          else if (severity === "mild" && control === "good" && c.stableYears >= 5) ceiling = "standard_plus";
          else ceiling = "standard";
        } else if (meta.id === "substance_treatment") {
          const years = has(c, "yearsSober") ? Number(c.yearsSober) : null;
          const tiers = rules.substanceTiers || { declineYears: 2, tiers: [{ minYears: 10, klass: "preferred" }, { minYears: 0, klass: "standard" }] };
          if (years !== null && years < tiers.declineYears) {
            decline.push({ id: c.id, text: `Substance treatment with less than ${tiers.declineYears} years since last use.` });
            ceiling = "decline";
          } else if (years !== null) {
            ceiling = null;
            for (const t of tiers.tiers) { if (years >= t.minYears) { ceiling = t.klass; break; } }
            if (!ceiling) ceiling = "table";
          } else {
            ceiling = "standard";
          }
        } else if (meta.id === "dysplastic_nevi") {
          ceiling = (c.count && c.count <= 3) ? "preferred" : "preferred_plus";
        } else {
          // generic: first ceiling
          ceiling = meta.ceilings[0].klass;
        }
      } else {
        // no ceiling defined (postpone/decline-only conditions like CAD, stroke, COPD)
        ceiling = null;
        if (meta.postpone && c.status === "current" && isYes(c.recentEvent)) {
          postpone.push({ id: c.id, text: `${meta.name}: ${meta.postpone}` });
        }
        if (meta.decline && c.status === "current" && c.severity === "severe") {
          decline.push({ id: c.id, text: `${meta.name}: ${meta.decline}` });
        }
        if (c.status === "resolved" && c.resolvedYears !== null && c.resolvedYears >= 1) {
          // stable resolved history may still be acceptable; keep at standard ceiling
          ceiling = "standard";
          details.push(`${meta.name}: resolved ${c.resolvedYears} yr ago — stable history, individual review.`);
        } else if (c.status === "current") {
          ceiling = "table"; // significant current condition without a published ceiling -> table/specialist review
          details.push(`${meta.name}: current condition — table-rated or specialist review.`);
        }
      }

      /* Carrier-specific best-class caps (conditionModels.best floors the
         computed ceiling at the carrier's best-case class, e.g., MOO caps
         anxiety/depression at Standard and bipolar at Table 2). */
      const cm = rules.conditionModels && rules.conditionModels[meta.id];
      if (cm && cm.best && ceiling && ceiling !== "postpone" && ceiling !== "decline" && CLASS_INDEX[ceiling] < CLASS_INDEX[cm.best]) {
        ceiling = cm.best;
      }

      /* Carrier-specific cap: conditions that exclude the preferred classes (Transamerica:
         no heart/vascular disease, diabetes, or cancer for preferred classes) */
      if (ceiling && ceiling !== "postpone" && ceiling !== "decline" && rules.medicalStandardCap && rules.medicalStandardCap.includes(meta.id)) {
        if (CLASS_INDEX[ceiling] < CLASS_INDEX.standard) ceiling = "standard";
      }

      /* Carrier-specific auto-declines from the impairment table */
      if (c.status === "current") {
        if (rules.autoDeclineIds && rules.autoDeclineIds.includes(meta.id)) {
          decline.push({ id: c.id, text: `${meta.name}: ${(meta.decline || "decline")}`, reason: "Carrier impairment table." });
          ceiling = "decline";
        } else if (rules.autoDeclineSevereIds && rules.autoDeclineSevereIds.includes(meta.id) && c.severity === "severe") {
          decline.push({ id: c.id, text: `${meta.name}: ${(meta.decline || "severe — decline")}`, reason: "Carrier impairment table." });
          ceiling = "decline";
        }
      }

      if (ceiling && ceiling !== "postpone" && ceiling !== "decline") {
        if (classWorseThan(ceiling, worst)) worst = ceiling;
      }
      const ceilingName = ceiling ? (ceiling === "decline" ? "decline screen" : ceiling === "postpone" ? "postpone" : ceiling) : "review";
      details.push(`${meta.name}: ${severity} / ${control} control — best supported class ${ceilingName}.`);
    }

    // Comorbidity interaction check
    const ids = new Set(conds.map(c => c.id));
    const combos = [];
    if (ids.has("diabetes") && (ids.has("cad") || ids.has("heart_disease") || ids.has("kidney_disease"))) {
      combos.push("Diabetes + coronary/cardiovascular or kidney disease");
    }
    if (ids.has("kidney_disease") && ids.has("hypertension")) combos.push("Chronic kidney disease + hypertension");
    if ((ids.has("anxiety") || ids.has("depression") || ids.has("bipolar")) && ids.has("substance_treatment")) {
      combos.push("Mental-health condition + alcohol/substance abuse");
    }

    return { klass: worst, details, postpone, decline, combos };
  }

  /* ---------- substance / lifestyle ----------------------------------- */

  function evalSubstance(rules, d) {
    if (!has(d, "alcoholConcern") && !has(d, "drugAbuse") && !has(d, "marijuana")) {
      return { klass: null, missing: true, detail: "Substance history not provided." };
    }
    let klass = "preferred_plus";
    const details = [];
    if (d.drugAbuse === "yes") {
      const years = has(d, "drugAbuseYears") ? Number(d.drugAbuseYears) : null;
      if (years === null) {
        return { klass: "decline", detail: "Drug abuse disclosed with no recovery duration — treat as decline screen pending details." };
      }
      const declineYears = (rules && rules.drugDeclineYears) || 3;
      if (years < declineYears) {
        return { klass: "decline", detail: `Non-marijuana drug use within ${years} years — decline/postpone screen (carrier window: ${declineYears} years).` };
      }
      if (rules && rules.drugRecoveryTiers) {
        // carrier-published recovery ladder (e.g., F&G: beyond 5 years -> Standard)
        let k = null;
        for (const t of rules.drugRecoveryTiers) { if (years >= t.minYears) { k = t.klass; break; } }
        klass = worstOf(klass, k || "standard");
      } else {
        // Banner class requirements: no abuse in past 7 years (Standard/Standard Plus), 10 years (Preferred)
        if (years < 7) klass = worstOf(klass, "table");
        else if (years < 10) klass = worstOf(klass, "standard_plus");
        else klass = worstOf(klass, "preferred");
      }
      details.push(`Drug abuse history ${years} yr ago — recovery duration reviewed.`);
    }
    if (d.alcoholConcern === "active") {
      return { klass: "decline", detail: "Current alcohol abuse or abstinence under 2 years — decline screen." };
    }
    if (d.alcoholConcern === "history") {
      klass = worstOf(klass, "standard");
      details.push("Alcohol abuse history — reviewed under recovery rules.");
    }
    /* Marijuana is rated separately from tobacco and never forces a tobacco
       class. Carriers that publish a daily-use decline (F&G Quantum/Pathsetter,
       National Life) treat daily use as a decline screen; medicinal use is rated
       on the underlying condition; infrequent recreational use may still
       qualify for preferred classes. */
    if (d.marijuana === "daily") {
      if (rules && rules.nicotine && rules.nicotine.marijuanaDailyDecline) {
        return { klass: "decline", detail: `Daily marijuana use — ${rules.name} publishes a daily-use decline screen.` };
      }
      details.push("Daily marijuana use — carrier frequency limits apply (F&G/National Life decline daily use).");
    } else if (d.marijuana === "medicinal") {
      details.push("Medicinal marijuana — rated on the underlying condition, not the substance itself.");
    } else if (d.marijuana === "infrequent") {
      details.push("Infrequent recreational marijuana — non-tobacco rates; preferred classes may be available.");
    } else if (d.marijuana === "frequent") {
      details.push("Frequent marijuana use — carrier frequency limits reviewed (e.g., F&G: under 4x/week acceptable; daily use declines).");
    }
    return { klass, details, detail: details.join(" ") || "No substance concerns." };
  }

  /* ---------- medications --------------------------------------------- */

  /* Normalize a medication entry for dictionary matching: lowercase,
     strip doses/packaging, drop punctuation. */
  function normalizeMed(t) {
    return String(t).toLowerCase()
      .replace(/\d+(\.\d+)?\s*(mg|mcg|g|ml|iu|units?|tablets?|capsules?|tabs?|caps?|patch|injection|pen|vial|spray|puffs?)/g, " ")
      .replace(/[^a-z ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  /* Match a normalized token against a MEDICATION_MAP entry using whole-word
     equality on normalized forms — substring matching over-matched common
     words (e.g. "none" ⊂ "eplerenone"). Aliases are full generic/brand names. */
  function medMatches(norm, entry) {
    if (!norm) return false;
    const normWords = norm.split(" ").filter(w => w.length >= 4);
    if (!normWords.length) return false;
    return entry.aliases.some(a => {
      const aw = normalizeMed(a);
      return !!aw && aw.length >= 4 && normWords.includes(aw);
    });
  }

  /**
   * Cross-check disclosed medications against the disclosed conditions and
   * the carrier's APS trigger list. Never a diagnosis: an undisclosed med
   * raises an advisory flag to confirm with the applicant.
   */
  function evalMedications(rules, d) {
    const raw = d.medicationsText;
    if (!raw || !String(raw).trim()) {
      return { klass: null, missing: true, meds: [], disclosed: [], undisclosed: [], apsTriggers: [], detail: "Medications not provided." };
    }
    const tokens = String(raw).split(/[,;\n]+/).map(t => t.trim()).filter(Boolean);
    const matched = [];
    for (const t of tokens) {
      const norm = normalizeMed(t);
      if (!norm) continue;
      const entry = MEDICATION_MAP.find(e => medMatches(norm, e));
      if (entry && !matched.some(m => m.conditionId === entry.condition && m.med === t)) {
        matched.push({ med: t, conditionId: entry.condition, conditionName: entry.name, apsLabel: entry.apsLabel });
      }
    }
    const condIds = (d.conditions || []).map(c => c.id);
    const disclosed = [], undisclosed = [];
    const seenD = new Set(), seenU = new Set();
    for (const m of matched) {
      if (condIds.includes(m.conditionId)) {
        if (!seenD.has(m.conditionId)) { disclosed.push(m); seenD.add(m.conditionId); }
      } else {
        if (!seenU.has(m.conditionId)) { undisclosed.push(m); seenU.add(m.conditionId); }
      }
    }
    // Carrier APS triggers suggested by the prescription record (disclosed or not)
    const apsConditions = (rules.evidence && rules.evidence.apsConditions) || [];
    const strip = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
    const apsTriggers = [];
    for (const m of matched) {
      const hit = apsConditions.find(a => {
        const aa = strip(a), ll = strip(m.apsLabel);
        return aa && ll && (aa.includes(ll) || ll.includes(aa));
      });
      if (hit && !apsTriggers.some(x => x.apsText === hit)) {
        apsTriggers.push({ conditionId: m.conditionId, conditionName: m.conditionName, apsText: hit, med: m.med });
      }
    }
    const parts = [];
    if (matched.length) parts.push(`${matched.length} medication(s) cross-checked.`);
    if (disclosed.length) parts.push(`${disclosed.length} consistent with disclosed conditions.`);
    if (undisclosed.length) parts.push(`${undisclosed.length} suggest a condition not disclosed — confirm with applicant.`);
    return { klass: null, missing: false, meds: matched, disclosed, undisclosed, apsTriggers, detail: parts.join(" ") || "Entered medications matched no reference entries." };
  }

  /* ---------- functional status / ADLs -------------------------------- */

  function evalFunctional(d) {
    if (!has(d, "adlAssistance") && !has(d, "livingSetting")) {
      return { klass: null, missing: true, detail: "Functional status not provided." };
    }
    if (d.livingSetting === "nursing" || d.livingSetting === "psychiatric" || d.livingSetting === "hospice" || d.homeHealth) {
      return { klass: "decline", flag: "adl_dependence", detail: "Facility care, hospice, or home-health care — specialist review / likely decline screen." };
    }
    if (d.mobility === "wheelchair_chronic" || d.mobility === "bedbound") {
      return { klass: "decline", flag: "adl_dependence", detail: "Chronic wheelchair dependence or bedbound — specialist review / likely decline screen." };
    }
    if (d.adlAssistance === "yes") {
      return { klass: "decline", flag: "adl_dependence", detail: "Ongoing ADL assistance required — specialist review / likely decline screen." };
    }
    return { klass: "preferred_plus", detail: "Fully independent — no functional limitation disclosed." };
  }

  /* ---------- pending care -------------------------------------------- */

  function evalPending(d) {
    if (!has(d, "pendingTests") && !has(d, "recentHospitalization") && !has(d, "recentSurgery") && !has(d, "activeSymptom")) {
      return { klass: null, missing: true, detail: "Pending-care status not provided." };
    }
    const gates = [];
    if (d.pendingTests === "yes") gates.push("pending test/referral with unknown results");
    if (d.recentHospitalization === "yes") gates.push("hospitalization within past 4 months");
    if (d.recentSurgery === "yes") gates.push("surgery within past 4 months");
    if (d.activeSymptom === "yes") gates.push("uninvestigated active symptom");
    if (gates.length) {
      return { klass: "postpone", detail: `Postpone screen: ${gates.join("; ")}.` };
    }
    return { klass: "preferred_plus", detail: "No pending care or uninvestigated findings." };
  }

  /* ---------- financial justification --------------------------------- */

  function evalFinancial(rules, d) {
    if (!has(d, "income") || !has(d, "faceAmount")) {
      return { flag: "missing_financial", detail: "Income or face amount not provided — financial justification unverified." };
    }
    const income = Number(d.income);
    const face = Number(d.faceAmount);
    const age = d.age ? Number(d.age) : null;
    if (age === null) return { flag: "missing_financial", detail: "Age not provided — financial multiplier unknown." };
    const m = (rules.financial.incomeMultipliers || []).find(x => age >= x.ageMin && age <= x.ageMax);
    if (!m) return { flag: "missing_financial", detail: "No financial multiplier for age." };
    const max = typeof m.multiplier === "number" ? m.multiplier * income : null;
    const ok = max === null ? null : face <= max;
    const fin = rules.financial || {};
    const extra = [];
    /* Total in-force + applied-for line caps (carrier-published eligibility
       limits, e.g., F&G Quantum: over $1,000,000 total requires another
       product). */
    const totalLineExceeded = !!(fin.totalLineCap && has(d, "existingCoverage") && (face + Number(d.existingCoverage || 0)) > fin.totalLineCap);
    if (totalLineExceeded) {
      const total = face + Number(d.existingCoverage || 0);
      extra.push(`Total coverage in force + applied ${total.toLocaleString()} exceeds the carrier's ${fin.totalLineCap.toLocaleString()} maximum — another product is required.`);
    }
    /* Replacement product rules (e.g., F&G Quantum: no internal or external
       replacements allowed — a replacement case cannot be written on it). */
    const replacementNotAllowed = !!(fin.noReplacements && d.replacement === "yes");
    if (replacementNotAllowed) {
      extra.push(`${rules.name} does not accept internal or external replacements — a replacement case cannot be written on this product.`);
    }
    return {
      multiplier: m.multiplier,
      maxJustified: max,
      ok,
      totalLineExceeded,
      replacementNotAllowed,
      detail: `Income ${income} x ${m.multiplier} = ${max === null ? "individual consideration" : "$" + max.toLocaleString()} justified for age ${age}. Requested face ${face.toLocaleString()} ${ok === false ? "EXCEEDS" : "within"} this guideline.${extra.length ? " " + extra.join(" ") : ""}`
    };
  }

  /* ---------- evidence requirements ----------------------------------- */

  function evidenceNeeded(rules, d, conditionIds) {
    const list = [];
    const age = d.age ? Number(d.age) : null;
    const face = d.faceAmount ? Number(d.faceAmount) : null;
    const hasAmtRules = (rules.evidence.amountRules || []).length > 0;

    if (hasAmtRules) {
      // Carrier-published age/amount evidence grid (e.g., Mutual of Omaha p. 16-17)
      for (const ar of rules.evidence.amountRules) {
        if (age !== null && face !== null && age >= ar.ageMin && age <= ar.ageMax && face >= ar.amountMin && (ar.amountMax === undefined || face <= ar.amountMax)) {
          ar.items.forEach(i => { if (!list.includes(i)) list.push(i); });
        }
      }
    } else if (Array.isArray(rules.evidence.requirementGrids) && rules.evidence.requirementGrids.length) {
      // Carrier-published per-band requirement grids (Transamerica's
      // age-and-face-amount charts, p. 7-9). Each grid maps (age band, face
      // band) to requirement codes. With no product selected, the union
      // across the carrier's product grids applies: a code that any product
      // requires at the applicant's age/amount is listed.
      const GRID_CODE_ITEMS = {
        V: "Vitals / paramed physical findings",
        BCP: "BCP (blood chemistry profile)",
        HOS: "HOS (home office urine specimen)",
        MVR: "MVR (motor vehicle report)",
        CS: "CS (Minnesota Cognitive Acuity Screen)",
        PFS: "PFS (personal financial statement)",
        ECG: "ECG (resting electrocardiogram)",
        IR: "IR (inspection report)"
      };
      for (const grid of rules.evidence.requirementGrids) {
        if (age === null || face === null) continue;
        const row = grid.rows.find(r => face >= r.min && face <= r.max);
        if (!row) continue;
        const ci = grid.ages.findIndex(a => age >= a[0] && age <= a[1]);
        if (ci < 0 || ci >= row.cells.length) continue;
        (row.cells[ci] || []).forEach(code => {
          const label = GRID_CODE_ITEMS[code];
          if (label && !list.includes(label)) list.push(label);
        });
      }
    } else if (rules.evidence.genericGrid !== false) {
      // Default age/amount grid (Banner-flavored); carriers that publish no
      // exam grid (e.g., F&G Quantum, underwritten from electronic databases)
      // set genericGrid: false and add their own lines on the results page.
      if (age !== null && age > 60) list.push("APS (always required over age 60)");
      if (age !== null && age >= 71) list.push("Daily Activities Questionnaire");
      if (face !== null) {
        if (age !== null && age <= 60 && face >= 100000) list.push("APM + blood/urine (age/amount requirements)");
        if (age !== null && age > 60 && face >= 100000) list.push("Blood/urine (age/amount requirements)");
        if (age !== null && age > 50 && face >= 2000000) list.push("EKG");
        if (age !== null && age >= 51 && age <= 60 && face > 1000000) list.push("ProBNP");
        if (age !== null && age > 60 && face > 250000) list.push("ProBNP");
        if (age !== null && age >= 50 && d.sex === "male") list.push("PSA");
        if (age !== null && age > 50) list.push("CEA");
      }
    }

    const apsList = (rules.evidence.apsConditions || []).filter(t =>
      conditionIds.some(id => id && (t.toLowerCase().includes(id.replace(/_/g, " ").toLowerCase()) || matchesAps(conditionIds, t)))
    );
    // condition-based APS mapping
    const apsMap = {
      cancer: "Cancer", diabetes: "Diabetes", cad: "Heart (cardiac) disease", heart_disease: "Heart (cardiac) disease",
      stroke: "Stroke / TIA", copd: "COPD / emphysema", kidney_disease: "Kidney disease", liver_disease: "Liver disease",
      dementia: "Cognitive disorders", substance_treatment: "Substance abuse/dependence", hiv: "Blood disorders",
      seizures: "Cognitive disorders", transplant: "Transplant", paralysis: "Paralysis"
    };
    const apsNeeded = [];
    conditionIds.forEach(id => { if (apsMap[id] && !apsNeeded.includes(apsMap[id])) apsNeeded.push(apsMap[id]); });
    apsNeeded.forEach(a => list.push(`APS: ${a}`));

    // Coverage-purpose financial evidence (Banner financial underwriting
    // guidance, p. 22-23 — the purpose determines what justifies the face
    // amount; similar purpose documents are standard across carriers).
    const purposeEvidence = {
      income: "Income verification (tax returns / W-2 / paystubs) may be required.",
      estate: "Estate analysis — asset and liability verification may be required (estate conservation / liquidity).",
      business: "Business insurance questionnaire (BIQ) and a cover letter explaining the purpose and how the face amount was determined.",
      mortgage: "Loan documentation supporting the debt / mortgage amount.",
      family: "Coverage justification — verify how the face amount was determined (income-replacement factors).",
      charity: "Contribution record confirming an established history of giving to the charity."
    };
    if (d.policyPurpose && purposeEvidence[d.policyPurpose]) list.push(purposeEvidence[d.policyPurpose]);
    if (d.replacement === "yes") list.push("Replacement disclosed — carrier replacement rules and disclosure requirements apply.");
    if (d.financing === "yes" || d.premiumPayor === "third_party" || d.premiumPayor === "financed") list.push("Third-party or financed premium disclosed — premium-financing financial review applies.");
    if (d.ownership === "business") list.push("Business-owned coverage disclosed — business insurance questionnaire / ownership documentation may be required.");
    if (isYes(d.parolePast) && !isYes(d.paroleCurrent)) list.push("History of probation/parole disclosed — carriers review recency and offense severity; additional information may be required.");
    if (isYes(d.foreignTravel)) list.push("Foreign travel disclosed — review destinations and duration; some destinations trigger postponement or additional requirements.");
    if (d.militaryService === "yes" || d.militaryService === "combat") {
      list.push("Military service disclosed — VA treatment records may be requested.");
      if (d.militaryService === "combat") list.push("Combat deployment disclosed — mental-health / TBI screening may apply.");
    }
    if (d.foreignResidence === "short" || d.foreignResidence === "long") {
      list.push("Foreign residence disclosed — carrier residency requirements and country-of-residence review apply; certain countries may postpone or add requirements.");
    }
    if (d.doctorVisits === "frequent" && !(d.conditions && d.conditions.length)) {
      list.push("Frequent physician visits with no disclosed condition — confirm the reason; uninvestigated care can matter more than known history.");
    }
    if (isYes(d.nicotineEver)) {
      if (d.usedNicotine === "no") {
        const qy = Number(d.nicotineQuitYears);
        if (!isNaN(qy) && qy >= 0 && qy <= 10) list.push("Nicotine answers conflict: 'ever used' yes but last use within 10 years contradicts the 'no' answer — confirm the quit date.");
        else list.push("Tobacco/nicotine use disclosed, last use more than 10 years ago — outside every carrier's lookback window; no class impact.");
      }
    }

    return { list, apsNeeded, apsList };
  }

  function matchesAps(conditionIds, t) { return false; }

  /* ---------- confidence ---------------------------------------------- */

  function computeConfidence(d, flags) {
    let score = 0, total = 0, missing = [];
    const checks = [
      ["heightIn", "height"], ["weightLb", "weight"], ["usedNicotine", "nicotine history"], ["bpSys", "blood pressure"],
      ["movingViolations3yr", "driving history"], ["alcoholConcern", "substance history"], ["drugAbuse", "drug use history"], ["occupationHazardous", "hazardous occupation status"], ["famCardio", "family history"], ["adlAssistance", "functional status"],
      ["livingSetting", "living setting"], ["mobility", "mobility"], ["pendingTests", "pending-care status"],
      ["recentHospitalization", "hospitalization status"], ["recentSurgery", "surgery status"], ["activeSymptom", "symptom status"],
      ["age", "age"], ["faceAmount", "face amount"], ["existingCoverage", "existing coverage"], ["policyPurpose", "policy purpose"],
      ["replacement", "replacement status"], ["financing", "premium financing status"], ["marijuana", "marijuana use"],
      ["paroleCurrent", "probation/parole status (current)"], ["parolePast", "probation/parole history"],
      ["aviation", "aviation exposure"], ["hazardousSports", "hazardous sports"], ["foreignTravel", "foreign travel"],
      ["ownership", "coverage ownership"], ["premiumPayor", "premium payor"],
      ["doctorVisits", "physician-visit frequency"], ["militaryService", "military service"], ["foreignResidence", "foreign residence"], ["nicotineEver", "nicotine ever-use history"]
    ];
    for (const [k, label] of checks) {
      total++;
      if (has(d, k)) score++; else missing.push(label);
    }
    if (d.conditions && d.conditions.length) {
      total++;
      const allDetailed = d.conditions.every(c => c.control && c.severity);
      if (allDetailed) score++;
      else missing.push("condition control details");
    }
    if (flags.includes("undisclosed_meds")) missing.push("medication-condition mismatch");
    if (flags.includes("missing_material_data")) missing.push("key data");
    const pct = score / total;
    if (pct >= 0.9) return { level: "High", missing };
    if (pct >= 0.7) return { level: "Moderate", missing };
    return { level: "Low", missing };
  }

  /* ---------- MAIN ENTRY ---------------------------------------------- */

  /**
   * Run the full engine.
   * @param {string} carrierId  'banner' | 'foresters'
   * @param {object} d          form data
   */
  function run(carrierId, d) {
    const rules = CARRIER_RULES[carrierId];
    if (!rules) return { error: "Unknown carrier" };
    const out = {
      carrier: rules.name,
      guide: rules.guide,
      inputs: d,
      domains: {},
      gates: { postpone: [], decline: [] },
      provisionalClass: null,
      finalClass: null,
      range: null,
      confidence: null,
      flags: [],
      evidence: null,
      financial: null,
      comorbidityFlags: [],
      limitingFactors: [],
      flatExtra: null,
      notes: []
    };

    /* ---- 1. Gate screen: postpone / decline ------------------------ */
    // Decline gates (hardest first)
    const declineHits = [];
    if (d.alcoholConcern === "active") declineHits.push("alcohol_active");
    if (d.drugAbuse === "yes") {
      const drugDeclineYears = rules.drugDeclineYears || 3;
      const yr = has(d, "drugAbuseYears") ? Number(d.drugAbuseYears) : null;
      if (yr === null || yr < drugDeclineYears) declineHits.push("drug_use_recent");
    }
    if (isYes(d.criminalActive) || isYes(d.paroleCurrent)) declineHits.push("criminal_active");
    if (isYes(d.bankruptcyActive)) declineHits.push("bankruptcy_active");
    const func = evalFunctional(d);
    if (func.flag === "adl_dependence") declineHits.push("adl_dependence", "facility_care");

    const conds = d.conditions || [];
    const condIds = conds.map(c => c.id);
    const med = evalMedical(rules, d);
    for (const dc of med.decline || []) out.gates.decline.push(dc);
    for (const pp of med.postpone || []) out.gates.postpone.push(pp);

    /* Foresters-specific medical screens (non-medical impairment guide) */
    if (rules.id === "foresters" && rules.medical) {
      for (const c of conds) {
        const declineText = rules.medical.medicalDeclinesMap[c.id];
        if (!declineText) continue;
        if (c.id === "other_cancer" && Number(c.resolvedYears || 0) >= 10) continue; // completed >10 yrs ago, no recurrence: acceptable
        out.gates.decline.push({ id: "foresters_" + c.id, text: declineText, reason: "Foresters non-medical impairment guide." });
      }
      const db = conds.find(c => c.id === "diabetes");
      if (db) {
        if (isYes(db.insulin) || db.complications === "yes") {
          out.gates.decline.push({ id: "foresters_diabetes", text: rules.medical.diabetesNonMed.decline, reason: "Foresters impairment guide." });
        }
      }
    }

    for (const t of rules.declineTriggers || []) {
      const hit = conditionDeclineHit(t.id, d, condIds, med);
      if (hit) declineHits.push(t.id);
    }

    const declineSet = new Set(declineHits);
    declineSet.forEach(id => {
      const t = (rules.declineTriggers || []).find(x => x.id === id);
      if (t && !out.gates.decline.some(g => g.id === t.id)) out.gates.decline.push({ id: t.id, text: t.text, reason: t.reason });
    });

    // Postpone gates
    const postponeHits = [];
    const pend = evalPending(d);
    if (pend.klass === "postpone") postponeHits.push("pending_test");
    if (isYes(d.a1cHigh)) postponeHits.push("a1c_high");
    if (isYes(d.diabetesComplications)) postponeHits.push("diabetes_complications");
    if (isYes(d.gastricBypassRecent)) postponeHits.push("gastric_bypass_recent");

    if (out.gates.postpone.length || postponeHits.length) {
      const postponeSet = new Set([...postponeHits, ...out.gates.postpone.map(g => g.id || "condition")]);
      postponeSet.forEach(id => {
        if (out.gates.postpone.some(g => g.id === id)) return;
        const t = (rules.postponeTriggers || []).find(x => x.id === id);
        if (t && !out.gates.postpone.some(g => g.id === t.id)) out.gates.postpone.push({ id: t.id, text: t.text, reason: t.reason });
      });
    }

    /* Deduplicate gate entries. evalMedical can push the same condition twice —
       its published decline/postpone text and the carrier's auto-decline trigger
       both fire — so keep the first entry per condition id. The results page,
       comparison view, and print sheet all consume these lists. */
    const dedupGates = arr => {
      const seen = new Set();
      return arr.filter(g => {
        const key = g.id || g.text;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    out.gates.decline = dedupGates(out.gates.decline);
    out.gates.postpone = dedupGates(out.gates.postpone);

    /* ---- 2. Domain best classes ----------------------------------- */
    const domains = {};

    const nic = evalNicotine(rules, d);
    domains.tobacco = nic;
    if (!nic.missing) {
      if (nic.klass === "tobacco") {
        out.notes.push(`Tobacco class applies — ${rules.name} offers Preferred Tobacco / Standard Tobacco; table ratings are not available with preferred tobacco classes.`);
      } else if (nic.klass) {
        domains.tobacco.klass = nic.klass; // best NT class by lookback
      }
    }

    const build = evalBuild(rules, d);
    domains.build = build;
    if (build.klass === "decline") {
      out.gates.decline.push({ id: "bmi_decline", text: `Build: BMI ${build.bmi} (${build.bandName})`, reason: "Carrier BMI chart — decline band." });
    }

    const bp = evalBP(rules, d);
    domains.bp = bp;

    const chol = evalCholesterol(rules, d);
    domains.cholesterol = chol;

    const drv = evalDriving(rules, d);
    domains.driving = drv;

    const fam = evalFamilyHistory(rules, d);
    domains.family = fam;

    domains.medical = med;

    const meds = evalMedications(rules, d);
    domains.medications = meds;

    const sub = evalSubstance(rules, d);
    domains.substance = sub;

    /* Hazardous occupation / avocation (carrier-published class criteria,
       e.g., MOO: PP no hazardous activity in 5 years, P in 2 years,
       Standard Plus allows flat extras; F&G: Preferred + flat-extra rating).
       Any of the hazardous-occupation / aviation / hazardous-sports answers
       being "yes" triggers the avocation lane; all three must be explicitly
       "no" for a clean avocation reading. */
    if (rules.avocation) {
      const hazYes = isYes(d.occupationHazardous) || isYes(d.aviation) || isYes(d.hazardousSports);
      const hazNo = isNo(d.occupationHazardous) && isNo(d.aviation) && isNo(d.hazardousSports);
      if (hazYes) {
        const fe = rules.avocation.flatExtra;
        if (fe) {
          // Flat-extra lane: the base class is the best class available with a
          // flat extra (e.g., F&G Preferred, MOO Standard Plus); the outcome
          // conversion happens after the class merge below.
          domains.avocation = { klass: fe.baseClass, flatExtra: fe, flag: "hazardous_avocation", detail: fe.text };
        } else {
          // Carrier caps below preferred instead of offering a flat extra
          // (e.g., National Life: Verified Standard pending underwriter review).
          domains.avocation = { klass: rules.avocation.classCap || "standard_plus", detail: rules.avocation.currentHazardousText, flag: "hazardous_avocation" };
        }
      } else if (hazNo) {
        domains.avocation = { klass: "preferred_plus", detail: rules.avocation.cleanText };
      } else {
        domains.avocation = { klass: null, missing: true, detail: "Hazardous occupation/avocation status not confirmed — verify before quoting preferred classes." };
      }
    }

    domains.functional = func;

    domains.pending = pend;

    out.domains = domains;
    out.medications = meds;

    /* ---- 3. Least favorable class wins ---------------------------- */
    const usable = Object.entries(domains).filter(([k, v]) => v && v.klass && v.klass !== "tobacco" && v.klass !== "bp_outside" && v.klass !== "lipids_outside" && v.klass !== "driving_outside" && v.klass !== "substandard_review" && v.klass !== "manual_review");
    let provisional = "preferred_plus";
    const limiting = [];
    for (const [k, v] of usable) {
      const txt = v.detail || (v.details ? v.details.join(" ") : "");
      if (classWorseThan(v.klass, provisional)) {
        provisional = v.klass;
        limiting.length = 0;
        limiting.push({ domain: k, klass: v.klass, detail: txt });
      } else if (v.klass === provisional) {
        limiting.push({ domain: k, klass: v.klass, detail: txt });
      }
    }
    // Domain-specific "outside" results that force a worse outcome
    const outside = [];
    if (domains.bp && domains.bp.klass === "bp_outside") outside.push({ domain: "bp", reason: "BP beyond Standard limits" });
    if (domains.cholesterol && domains.cholesterol.klass === "lipids_outside") outside.push({ domain: "cholesterol", reason: "Lipids beyond Standard limits" });
    if (domains.driving && domains.driving.klass === "driving_outside") outside.push({ domain: "driving", reason: "Driving history beyond Standard limits" });
    if (domains.build && domains.build.klass === "substandard_review") outside.push({ domain: "build", reason: "Build above Standard maximum — substandard build chart required" });
    if (domains.build && domains.build.klass === "manual_review") outside.push({ domain: "build", reason: "Build requires manual review (low build / BMI / unexplained change)" });

    if (outside.length) provisional = "table";
    out.provisionalClass = provisional;
    out.limitingFactors = limiting;
    out.outsideFactors = outside;

    /* ---- Tobacco override ----------------------------------------- */
    let final = provisional;
    if (nic.tobacco) {
      // Tobacco is a separate classification, not a lower medical class. A clean
      // profile supports Preferred Tobacco; a table rating cannot pair with
      // Preferred Tobacco (per Banner), so cap at Standard Tobacco when table-rated.
      if (final === "table") final = "standard";
      out.tobaccoClass = true;
    }
    // Foresters publishes Tobacco Plus (nicotine within the past year AND all
    // Preferred Plus criteria; <= 1 pack per day for cigarettes). Heavier use,
    // or any nicotine product above that threshold, cannot claim Tobacco Plus
    // and lands in Standard Tobacco instead.
    if (nic.tobacco && carrierId === "foresters" && final === "preferred_plus") {
      const amt = d.nicotineAmount === "" || d.nicotineAmount === undefined || d.nicotineAmount === null ? NaN : Number(d.nicotineAmount);
      const heavy = d.nicotineProduct === "cigarette" && !isNaN(amt) && amt > 20;
      if (heavy) final = "standard";
      else out.tobaccoPlus = true;
    }
    if (nic.klass && nic.klass !== "tobacco" && !nic.tobacco) {
      // nicotine lookback can cap NT class below other domains
      final = worstOf(final, nic.klass);
    }
    // Build data that cannot be evaluated (manual_review) ranks above every
    // estimable class but below the postpone/decline gates, so it never masks
    // a gate outcome — the gate assignment below wins.
    if (domains.build && domains.build.klass === "manual_review") {
      final = worstOf(final, "manual_review");
    }

    /* ---- 4. Gate outcomes override -------------------------------- */
    let gateOutcome = null;
    if (out.gates.decline.length) gateOutcome = "decline";
    else if (out.gates.postpone.length || postponeHits.length) gateOutcome = "postpone";

    if (gateOutcome) {
      final = gateOutcome;
    }

    /* Flat-extra outcome: when the carrier publishes a flat-extra lane for a
       hazardous avocation (e.g., F&G Preferred + flat extra, MOO Standard Plus
       + flat extra) and the rest of the profile supports at least the flat-extra
       base class, the estimate is a flat extra on that base class. A worse class
       from another domain stands on its own, and a gate outcome always wins —
       a flat extra never masks a decline/postpone. */
    const fe = domains.avocation && domains.avocation.flatExtra;
    if (!gateOutcome && fe && CLASS_INDEX[final] !== undefined && CLASS_INDEX[final] <= CLASS_INDEX[fe.baseClass]) {
      out.flatExtra = { baseClass: fe.baseClass, reason: fe.text, tobacco: !!out.tobaccoClass };
      final = "flat_extra";
    }

    out.finalClass = final;

    /* ---- 5. Credits (possible, not applied) ----------------------- */
    const creditEligible = ["build", "bp", "family", "cholesterol"];
    const adverseDomains = [];
    for (const [k, v] of Object.entries(domains)) {
      if (v && v.klass && v.klass !== "preferred_plus" && v.klass !== "tobacco" && creditEligible.includes(k)) {
        adverseDomains.push(k);
      }
    }
    let possibleCredit = null;
    if (rules.credit && adverseDomains.length === 1) {
      if (final === "preferred") {
        // e.g., BP in Preferred range while everything else is PP -> possible Preferred Plus via credit review
        possibleCredit = { from: final, to: "preferred_plus", note: rules.credit.note };
      } else if (final === "standard_plus") {
        possibleCredit = { from: final, to: "preferred", note: rules.credit.note };
      } else if (final === "standard") {
        possibleCredit = { from: final, to: "standard_plus", note: rules.credit.note };
      }
    }
    out.possibleCredit = possibleCredit;

    /* ---- 6. Flags ------------------------------------------------- */
    const flags = [];
    if (final === "table" || outside.length) flags.push("likely_table");
    if (gateOutcome === "decline" || out.gates.decline.length) flags.push("possible_decline");
    if (gateOutcome === "postpone" || out.gates.postpone.length) flags.push("manual_review");
    if (build.missing || bp.missing || chol.missing || drv.missing || fam.missing || sub.missing || func.missing || pend.missing || nic.missing || meds.missing) {
      flags.push("missing_material_data");
    }
    if (meds.undisclosed && meds.undisclosed.length) flags.push("undisclosed_meds");
    if (final === "manual_review") flags.push("manual_review");
    if (out.flatExtra) flags.push("flat_extra");
    // Past (not current) probation/parole is a review item, not an automatic
    // decline — carriers weigh recency and offense severity.
    if (isYes(d.parolePast) && !isYes(d.paroleCurrent)) flags.push("criminal_history");
    // Frequent physician visits with no disclosed condition = uninvestigated
    // care, which can matter more than the known history.
    if (d.doctorVisits === "frequent" && !(d.conditions && d.conditions.length)) flags.push("unexplained_care");
    // Extended foreign residence triggers carrier residency eligibility review.
    if (d.foreignResidence === "long") flags.push("foreign_residence");
    // Nicotine ever/quit-history conflicts — surface for confirmation.
    if (d.usedNicotine === "yes" && d.nicotineEver === "no") flags.push("conflicting_disclosure");
    if (d.usedNicotine === "no" && d.nicotineEver === "yes" && !isNaN(Number(d.nicotineQuitYears)) && Number(d.nicotineQuitYears) >= 0 && Number(d.nicotineQuitYears) <= 10) flags.push("conflicting_disclosure");

    // evidence flags
    const ev = evidenceNeeded(rules, d, condIds);
    const apsAge = rules.evidence.apsAge || 60;
    if (ev.apsNeeded.length || (d.age && d.age >= apsAge)) flags.push("needs_aps");
    if (d.age && d.faceAmount && (Number(d.faceAmount) >= 2000000 || (d.age > 60 && Number(d.faceAmount) >= 500000))) flags.push("needs_exam");
    const auw = rules.evidence.acceleratedUw;
    let auPossible = false;
    if (auw) {
      auPossible = !!(d.age && d.faceAmount && d.age >= auw.ageMin && d.age <= auw.ageMax && Number(d.faceAmount) >= auw.amountMin && Number(d.faceAmount) <= auw.amountMax);
    } else if (d.age && d.faceAmount && d.age >= 20 && d.age <= 60 && Number(d.faceAmount) <= 5000000) {
      auPossible = true;
    }
    if (auPossible) {
      // Banner publishes explicit accelerated-UW exclusions: no premium
      // financing and no policy lapse or replacement considered within the
      // last 6 months (no internal lapse/replacement within 2 years). Other
      // carriers' AU lanes are unchanged until their guides publish similar
      // conditions.
      if (rules.financial && rules.financial.auExcludesReplacement && (d.replacement === "yes" || d.financing === "yes" || d.premiumPayor === "third_party" || d.premiumPayor === "financed")) {
        ev.list.push("Premium financing or a recent replacement disclosed — accelerated underwriting not available; standard underwriting applies.");
      } else {
        flags.push("accelerated_uw_possible");
      }
    }

    out.flags = [...new Set(flags)];
    out.evidence = ev;

    // medication-driven APS triggers from the prescription record
    if (ev && ev.list && meds.apsTriggers && meds.apsTriggers.length) {
      meds.apsTriggers.forEach(t => ev.list.push(`APS: ${t.apsText} (medication ${t.med} suggests ${t.conditionName})`));
    }

    /* ---- 7. Financial -------------------------------------------- */
    out.financial = evalFinancial(rules, d);
    if (out.financial && (out.financial.ok === false || out.financial.totalLineExceeded || out.financial.replacementNotAllowed)) {
      out.flags.push("financial_review");
    }
    if (rules.financial && rules.financial.maxFace && d.faceAmount && Number(d.faceAmount) > rules.financial.maxFace) {
      out.flags.push("financial_review");
      out.financial = out.financial || {};
      out.financial.maxFaceExceeded = true;
      out.financial.detail = (out.financial.detail ? out.financial.detail + " " : "") + `Face amount ${Number(d.faceAmount).toLocaleString()} exceeds the carrier's ${rules.financial.maxFace.toLocaleString()} maximum — another product is required.`;
    }

    /* ---- 8. Comorbidity flags ------------------------------------- */
    out.comorbidityFlags = med.combos || [];

    /* ---- 9. Confidence --------------------------------------------- */
    out.confidence = computeConfidence(d, out.flags);

    /* ---- Range ----------------------------------------------------- */
    const classInfo = rules.classInfo || {};
    out.classInfo = classInfo;

    // Build final range: from best supported domain class to final
    let bestDomain = "preferred_plus";
    for (const [k, v] of Object.entries(domains)) {
      if (v && v.klass && !["tobacco", "bp_outside", "lipids_outside", "driving_outside", "substandard_review", "manual_review"].includes(v.klass)) {
        if (CLASS_INDEX[v.klass] < CLASS_INDEX[bestDomain]) bestDomain = v.klass;
      }
    }
    if (nic.klass && nic.klass !== "tobacco" && CLASS_INDEX[nic.klass] < CLASS_INDEX[bestDomain]) bestDomain = nic.klass;
    out.range = { low: bestDomain, high: final };

    out.summaryLines = buildSummary(out, rules);
    return out;
  }

  /* conditionDeclineHit: map form flags to decline trigger ids */
  function conditionDeclineHit(id, d, condIds, med) {
    switch (id) {
      case "alcohol_active": return d.alcoholConcern === "active";
      case "drug_use_recent": return d.drugAbuse === "yes" && (!has(d, "drugAbuseYears") || Number(d.drugAbuseYears) < 3);
      case "dementia": return condIds.includes("dementia");
      case "cirrhosis": return condIds.includes("liver_disease") && isYes(d.cirrhosis);
      case "defibrillator": return condIds.includes("heart_disease") && isYes(d.defibrillator);
      case "cardiomyopathy": return condIds.includes("heart_disease") && isYes(d.cardiomyopathy);
      case "hiv": return condIds.includes("hiv");
      case "renal_failure": return condIds.includes("kidney_disease") && (isYes(d.dialysis) || isYes(d.kidneyFailure));
      case "quadriplegia": return condIds.includes("paralysis") && d.paralysisType === "quadriplegia";
      case "stroke_severe": return condIds.includes("stroke") && (isYes(d.strokeSevere) || isYes(d.multipleStrokes));
      case "suicide_multiple": return isYes(d.suicideMultiple);
      case "transplant": return condIds.includes("transplant");
      case "bankruptcy_active": return isYes(d.bankruptcyActive);
      case "criminal_active": return isYes(d.criminalActive);
      case "adl_dependence": return d.adlAssistance === "yes" || d.mobility === "wheelchair_chronic" || d.mobility === "bedbound";
      case "facility_care": return d.livingSetting === "nursing" || d.livingSetting === "psychiatric" || d.livingSetting === "hospice" || isYes(d.homeHealth);
      case "wheelchair": return d.mobility === "wheelchair_chronic";
      case "oxygen_use": return isYes(d.oxygenUse);
      default: return false;
    }
  }

  /* Build human-readable summary lines for the results page */
  function buildSummary(out, rules) {
    const lines = [];
    const cls = out.classInfo[out.finalClass] || { name: out.finalClass.replace(/_/g, " ") };
    lines.push(`Preliminary estimate: ${cls.name || out.finalClass}`);
    if (out.tobaccoClass) lines.push("Nicotine history drives a separate tobacco class.");
    if (out.possibleCredit) {
      const from = (out.classInfo[out.possibleCredit.from] || { name: out.possibleCredit.from }).name;
      const to = (out.classInfo[out.possibleCredit.to] || { name: out.possibleCredit.to }).name;
      lines.push(`Possible one-class credit review: ${from} → ${to}. ${out.possibleCredit.note}`);
    }
    if (out.medications && out.medications.undisclosed && out.medications.undisclosed.length) {
      out.medications.undisclosed.forEach(u => lines.push(`Medication cross-check: ${u.med} suggests ${u.conditionName} — not disclosed. Confirm with the applicant and update medical history before submission.`));
    }
    if (out.financial && out.financial.ok === false) lines.push(out.financial.detail);
    return lines;
  }

  return { run, classWorseThan, worstOf, CLASS_INDEX };
})();
