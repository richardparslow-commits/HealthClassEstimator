/* Carrier-neutral, deduplicated life-insurance pre-underwriting intake.
 * One dated disclosure replaces overlapping lookback questions. NEVER collect
 * SSN, bank, routing, license, passport, visa, tax, or policy identifiers.
 * These are screening prompts, NOT a carrier application or eligibility rule.
 */
"use strict";
const IntakeQuestions = (() => {
  const Q=(id,label,type="yn",extra={})=>({id,label,type,...extra});
  const R=(id,label,fields,extra={})=>({id,label,type:"repeat",fields,...extra});
  const G=(title,questions,note="")=>({title,questions,note});
  const S=(title,groups)=>({title,groups});
  const yes=k=>({key:k,in:["yes"]});
  const regions=[["citizen","U.S. citizen"],["permanent","Permanent resident"],["visa","Other valid visa / temporary status"],["itin","Other documented status"],["other","Another status"],["unknown","Unsure"]];
  const conditions=[
    ["hypertension","High blood pressure"],["cholesterol","High cholesterol"],["diabetes","Diabetes"],["asthma","Asthma"],
    ["sleep_apnea","Sleep apnea"],["atrial_fibrillation","Atrial fibrillation / other arrhythmia"],["coronary_disease","Coronary artery disease / heart attack / angina"],
    ["heart_failure","Heart failure / cardiomyopathy"],["stroke","Stroke"],["tia","Transient ischemic attack (TIA)"],["aneurysm","Aneurysm"],
    ["heart_valve","Heart valve disease"],["pacemaker","Pacemaker or defibrillator"],["peripheral_vascular","Peripheral vascular or carotid artery disease"],
    ["pulmonary_hypertension","Pulmonary hypertension"],["cancer","Cancer / tumor / melanoma / blood cancer"],
    ["kidney_disease","Chronic kidney disease / renal insufficiency"],["end_stage_kidney","Kidney failure / dialysis"],["liver_disease","Liver disease / liver failure"],
    ["cirrhosis","Cirrhosis"],["hepatitis_b","Hepatitis B"],["hepatitis_c","Hepatitis C"],["pancreatitis","Pancreatitis"],
    ["copd","COPD / emphysema / chronic bronchitis"],["cystic_fibrosis","Cystic fibrosis"],["respiratory_failure","Respiratory failure"],
    ["als","ALS / motor neuron disease"],["parkinsons","Parkinson's disease"],["multiple_sclerosis","Multiple sclerosis"],["huntington","Huntington's disease"],
    ["lupus","Systemic or discoid lupus"],["rheumatoid_arthritis","Rheumatoid / psoriatic arthritis"],["myasthenia","Myasthenia gravis"],
    ["connective_tissue","Other connective tissue disease"],["alzheimers","Alzheimer's disease"],["dementia","Dementia"],
    ["epilepsy","Epilepsy / seizures / convulsions"],["hiv","HIV / AIDS / immune deficiency"],["tuberculosis","Tuberculosis"],
    ["organ_transplant","Organ transplant"],["tissue_transplant","Tissue transplant"],["transplant","Transplant (other)"],
    ["brain_tumor","Brain tumor"],["amputation","Amputation due to disease"],["paralysis","Paralysis / cerebral palsy"],
    ["muscular_dystrophy","Muscular dystrophy"],["marfan","Marfan syndrome"],["sickle_cell","Sickle cell disease"],
    ["hemophilia","Hemophilia / bleeding disorder"],["anemia","Anemia"],["leukemia","Leukemia / multiple myeloma / lymphoma"],
    ["crohns","Crohn's disease"],["ulcerative_colitis","Ulcerative colitis"],["gallbladder","Gallbladder disorder"],
    ["thyroid","Thyroid disease / goiter"],["urinary","Bladder / urinary / prostate / reproductive condition"],
    ["back_joint","Chronic back, joint or muscle condition"],["vision_hearing","Vision or hearing impairment / blindness"],
    ["migraine","Migraine headaches"],["neuropathy","Neuropathy"],["autism","Autism spectrum disorder / developmental condition"],
    ["congenital","Birth defect / congenital condition"],["chronic_pain","Chronic pain"],["obesity","Obesity / bariatric surgery"],
    ["hiv_related","Immune-related recurrent infections"],["other","Another physical diagnosis or medical condition"]
  ];
  const sections=[
    S("Proposed Insured Information, Citizenship & Foreign Travel",[
      G("1A. Basic demographics & contact information",[
        Q("fullLegalName","Full legal name (as you want to be contacted)","text"),
        Q("dob","Date of birth","date"),
        Q("birthPlace","Place of birth (state or country only)","text"),
        Q("state","Current U.S. state or territory of residence","states"),
        Q("sex","Sex recorded at birth","choice",{options:[["male","Male"],["female","Female"],["unknown","Prefer to review / unsure"]]}),
        Q("heightIn","Height (inches)","number",{min:36,max:100,step:0.5}),
        Q("weightLb","Current weight (pounds)","number",{min:30,max:1000}),
        Q("contactEmail","Email address for follow-up (optional)","email"),
        Q("contactPhone","Phone number for follow-up (optional)","tel")
      ]),
      G("1B. Citizenship & residency",[
        Q("citizenship","Current U.S. citizenship or residency status","choice",{options:regions}),
        Q("usResident","Do you currently reside in the United States?"),
        Q("usSince","When did your present continuous U.S. residency begin?","date"),
        Q("intentStay","Do you intend to continue living in the United States?"),
        Q("citizenshipCountry","Country of citizenship (if not a U.S. citizen)","text",{when:{key:"citizenship",in:["permanent","visa","itin","other"]}}),
        Q("visaType","Immigration/visa category (description only; no document numbers)","text",{when:{key:"citizenship",in:["visa","itin","other"]}}),
        Q("residedFiveYears","Have you lived continuously in the U.S. for the past five years?", "yn",{when:{key:"citizenship",in:["permanent","visa","itin","other"]}}),
        Q("returnNativeCountry","Do you plan to return to live in your country of citizenship?","yn",{when:{key:"citizenship",in:["permanent","visa","itin","other"]}}),
        Q("usProperty","Do you own or maintain a residence or business property in the U.S.?","yn",{when:{key:"citizenship",in:["permanent","visa","itin","other"]}}),
        Q("usPropertyKind","Is that U.S. property a home, business, or both? (No address needed)","choice",{options:[["home","Residence"],["business","Business"],["both","Both"]],when:yes("usProperty")}),
        Q("establishedCare","Do you have an established U.S. physician or clinic?","yn",{when:{key:"citizenship",in:["permanent","visa","itin","other"]}}),
        Q("establishedCareDetails","Name of U.S. physician or clinic and month/year of most recent visit (no patient IDs)","text",{when:yes("establishedCare")}),
        Q("documentsAvailable","Do you have current documentation of your immigration/residency status? (Do not enter or upload identifiers)","yn",{when:{key:"citizenship",in:["permanent","visa","itin","other"]}})
      ]),
      G("1C. Foreign residence & travel",[
        Q("foreignResidence","Have you lived outside the U.S. for at least one month during the past five years?"),
        Q("travelHistory","Have you traveled or worked abroad within the last five years, or do you plan travel, work, or residence outside the United States in the next two years?"),
        R("travels","Foreign trip / period of residence",[
          Q("country","Destination country and region","text"),
          Q("purpose","Trip purpose, work duties, and frequency","text"),
          Q("start","Departure or residence-start date","date"),
          Q("end","Return or residence-end date","date"),
          Q("rural","Will you spend time in non-urban areas?"),
          Q("ruralDetails","Accommodations, medical access, and planned transport","text",{when:yes("rural")}),
          Q("hazard","Will the trip include a war zone or other hazardous area?"),
          Q("expedition","Will it include an expedition or remote travel?"),
          Q("expeditionDetails","Expedition area, duration, and frequency","text",{when:yes("expedition")})
        ],{when:{any:[yes("foreignResidence"),yes("travelHistory")]}})
      ],"List each distinct trip or period once, with dates. Overlapping 12- and 24-month questions are assessed from these details.")
    ]),
    S("Occupation, Income, Military Service & Financial History",[
      G("2A. Occupation, income & hazardous work",[
        Q("employment","Current work status","choice",{options:[["employed","Employed / self-employed"],["retired","Retired"],["disabled","Not working due to disability"],["student","Student"],["homemaker","Stay-at-home parent / homemaker"],["unemployed","Unemployed"],["other","Other"]]}),
        Q("employerName","Employer or self-employment business name (if applicable)","text",{when:{key:"employment",in:["employed"]}}),
        Q("occupation","Current or most recent occupation","text"),
        Q("occupationDuties","Describe your actual work duties","textarea"),
        Q("hireDate","Current position start date (if applicable)","date",{when:{key:"employment",in:["employed"]}}),
        Q("income","Annual salary or earned income (optional; estimated amount)","number"),
        Q("householdIncome","Annual household income (optional; estimated amount)","number"),
        Q("hazardousOccupation","Does your work involve hazardous duties, including firearms, explosives, heights, underground work, underwater work, toxic materials, or heavy machinery?"),
        Q("occupationalHazards","Describe the hazardous work, exposures, heights, and frequency","textarea",{when:yes("hazardousOccupation")})
      ]),
      G("2B. Military service",[
        Q("militaryService","Have you ever served in the U.S. armed forces or reserves?"),
        Q("militaryBranch","Service branch and highest rank (no service number)","text",{when:yes("militaryService")}),
        Q("serviceStart","Date military service began","date",{when:yes("militaryService")}),
        Q("serviceEnd","Date military service ended (leave blank if serving)","date",{when:yes("militaryService")}),
        Q("militaryDeployment","Have you been on active duty or deployed within the past 12 months?","yn",{when:yes("militaryService")}),
        Q("militaryFlight","Did your military service include aircraft or flying duties?","yn",{when:yes("militaryService")}),
        Q("militaryFlightDetails","Describe military flight role, aircraft and mission type (no classified details)","textarea",{when:yes("militaryFlight")})
      ]),
      G("2C. Bankruptcy history",[
        Q("bankruptcyHistory","Have you personally, or through a business you owned, ever filed for bankruptcy?"),
        R("bankruptcies","Bankruptcy filing",[
          Q("kind","Personal or business filing","choice",{options:[["personal","Personal"],["business","Business"]]}),
          Q("chapter","Filing chapter (if known)","choice",{options:[["7","Chapter 7"],["11","Chapter 11"],["13","Chapter 13"],["other","Other / unsure"]]}),
          Q("filed","Filing date","date"),
          Q("status","Current status","choice",{options:[["pending","Pending"],["discharged","Discharged"],["dismissed","Dismissed"],["other","Other / unsure"]]}),
          Q("discharge","Discharge or anticipated resolution date","date"),
          Q("details","Circumstances in general terms (no case number)","textarea")
        ],{when:yes("bankruptcyHistory")})
      ])
    ]),
    S("Existing Insurance, Replacement & Recent Applications",[
      G("3. Coverage & application history",[
        Q("faceAmount","Approximate amount of new coverage desired, if known ($)","number"),
        Q("policyPurpose","Main reason for considering life insurance","choice",{options:[["income","Income protection"],["mortgage","Mortgage or debt"],["family","Family support"],["estate","Estate planning"],["business","Business needs"],["final_expense","Final expenses"],["other","Other"]]}),
        Q("existingInsurance","Do you currently have life insurance, disability insurance, or annuities?"),
        R("insurancePolicies","Existing coverage",[
          Q("kind","Coverage category","choice",{options:[["life","Life insurance"],["disability","Disability income"],["annuity","Annuity"]]}),
          Q("company","Insurance company name (no policy number)","text"),
          Q("coverage","Approximate coverage or contract amount ($)","number"),
          Q("issueYear","Year purchased / issued","number"),
          Q("replacement","Will this coverage be replaced or modified?")
        ],{when:yes("existingInsurance")}),
        Q("replacement","Are you considering replacing, terminating, or changing existing life/disability insurance or an annuity?"),
        Q("recentApplications","Have you applied for life insurance or an annuity within the past 90 days?"),
        R("recentInsuranceApps","Recent insurance application",[
          Q("company","Company applied to","text"),Q("applied","Approximate application date","date"),Q("status","Application outcome (if known)","text")
        ],{when:yes("recentApplications")}),
        Q("priorInsuranceAdverse","Have you ever had insurance declined, postponed, rated, offered on modified terms, or reduced?"),
        Q("priorInsuranceDate","When was the most recent unfavorable insurance decision?","date",{when:yes("priorInsuranceAdverse")}),
        Q("priorInsuranceDetails","Type of insurance, reason given, and company (no policy number)","textarea",{when:yes("priorInsuranceAdverse")}),
        Q("financing","Would life insurance premiums be financed or paid using a loan?")
      ],"Information is for general case review only. No carrier, product, underwriting route or policy number is requested.")
    ]),
    S("Tobacco & Nicotine Use",[
      G("4. All-time nicotine and tobacco exposure",[
        Q("nicotineHistory","Have you ever used nicotine, tobacco, cigarettes, cigars, pipes, chewing products, patches, gum, or vapes?","choice",{options:[["never","Never"],["yes","Currently or formerly used"],["unknown","Unsure"]]}),
        R("nicotine","Nicotine or tobacco product",[
          Q("product","Product used","choice",{options:[["cigarette","Cigarettes"],["cigar","Cigars"],["pipe","Pipe / hookah"],["chew","Chewing tobacco / snuff"],["nicotine","Nicotine patches / gum / pouches"],["vape","Nicotine vape"],["vape_no_nicotine","Zero-nicotine vape"],["cessation","Smoking-cessation product"],["other","Other"]]}),
          Q("current","Do you currently use this product?"),
          Q("lastDate","Most recent use date (use today's date if still using)","date"),
          Q("frequency","Typical amount and frequency","text"),
          Q("occasional","Is this use restricted to occasional cigar or pipe use?")
        ],{when:{key:"nicotineHistory",in:["yes"]}}),
        Q("nicotineComplete","Have you listed every nicotine/tobacco product and its most recent use?","confirm"),
        Q("cotinineResult","Most recent cotinine test, if known","choice",{options:[["negative","Negative"],["positive","Positive"],["unknown","No test / unsure"]]}),
        Q("cotinineDate","Cotinine test date, if available","date")
      ],"One recorded date per product supports 12-month, 36-month and five-year lookbacks without repeated questions.")
    ])
  ];

  sections.push(
    S("Health & Medical History",[
      G("5A. Current health, disability & functional capacity",[
        Q("careFacility","Are you currently staying in a hospital, rehabilitation, nursing, or medical facility because of illness?"),
        Q("bedOrWheelchair","Are you confined to bed or a wheelchair because of a chronic condition?"),
        Q("homeHealth","Do you currently receive home nursing care or hospice care?"),
        Q("adlAssistance","Do you need another person's help bathing, dressing, eating, toileting, or taking medicines?"),
        Q("terminalIllness","Have you been told by a medical professional that you have a terminal or end-stage condition?"),
        Q("terminalMonths","If your clinician provided an estimated prognosis, what is it (months)?","number",{when:yes("terminalIllness")}),
        Q("mobilityEquipment","Have you used a prescribed walker, wheelchair, scooter, oxygen, or catheter in the past 12 months?"),
        Q("mobilityDetails","Describe the device used, why, and the dates (not an equipment serial number)","textarea",{when:yes("mobilityEquipment")}),
        Q("oxygen","Do you currently require prescribed supplemental oxygen (not just CPAP)?"),
        Q("dialysis","Do you currently receive dialysis?"),
        Q("disabled","Are you currently disabled or receiving disability-related benefits or compensation, or have you received them previously?"),
        Q("disabilitySince","When did the disability or related work restriction begin?","date",{when:yes("disabled")}),
        Q("disabilityWork","Has illness or injury prevented you from working full time in your usual occupation in the past 12 months?"),
        Q("limitedDailyLiving","Has illness or injury prevented work or everyday activities at any point in the past five years?"),
        Q("transplantRecommended","Have you ever received, or been advised to receive, an organ or tissue transplant?")
      ]),
      G("5B & 5D. Diagnoses across lifetime and historical lookback windows",[
        Q("medicalHistory","Have you ever received medical diagnosis, evaluation, or treatment for a physical condition, even if resolved?"),
        R("conditions","Physical medical condition",[
          Q("id","Diagnosis or disorder","conditions"),
          Q("name","Describe the diagnosis or specify 'Other'","text",{when:{key:"id",in:["other"]}}),
          Q("diagnosisDate","Date first diagnosed","date"),
          Q("status","Current status","choice",{options:[["current","Current"],["resolved","Resolved"],["unknown","Unsure"]]}),
          Q("treatmentEnd","Treatment end date, if resolved","date",{when:{key:"status",in:["resolved"]}}),
          Q("lastTreatment","Most recent treatment or assessment date","date"),
          Q("treatment","Non-prescription treatment, procedures and follow-up (list medications only in 5F)","textarea"),
          Q("complications","Has this condition caused complications?"),
          Q("complicationDetails","Describe complications, dates, and treatment","textarea",{when:yes("complications")}),
          Q("recurrence","Has this condition recurred or happened more than once?"),
          Q("hospitalized","Have you been admitted to a hospital because of this condition?"),
          Q("hospitalDate","Most recent related hospitalization date","date",{when:yes("hospitalized")}),
          Q("a1c","Latest measured A1c, if known","number",{when:{key:"id",in:["diabetes"]},step:0.1}),
          Q("a1cDate","Date of latest A1c result","date",{when:{key:"id",in:["diabetes"]}}),
          Q("insulin","Do you currently use insulin?","yn",{when:{key:"id",in:["diabetes"]}}),
          Q("diabetesComplications","Has diabetes caused eye, kidney, nerve, or severe low-blood-sugar complications?","yn",{when:{key:"id",in:["diabetes"]}}),
          Q("diabetesYoung","Was diabetes first diagnosed before age 35?","yn",{when:{key:"id",in:["diabetes"]}}),
          Q("insulinBefore50","Did you first use insulin before age 50?","yn",{when:{key:"id",in:["diabetes"]}}),
          Q("bpBefore30","Was high blood pressure diagnosed before age 30?","yn",{when:{key:"id",in:["hypertension"]}}),
          Q("bpThreeDrugs","Do you take at least three blood-pressure medications?","yn",{when:{key:"id",in:["hypertension"]}}),
          Q("apneaTherapy","Are you currently using recommended sleep apnea treatment?","yn",{when:{key:"id",in:["sleep_apnea"]}}),
          Q("apneaRecent","Was sleep apnea first diagnosed within the past six months?","yn",{when:{key:"id",in:["sleep_apnea"]}}),
          Q("respiratoryER","In the past five years, have you needed an ER visit or admission because of breathing problems?","yn",{when:{key:"id",in:["asthma","copd","pulmonary_hypertension","cystic_fibrosis","respiratory_failure"]}}),
          Q("respiratoryERDetails","Dates and city/state of respiratory ER visits or admissions","textarea",{when:yes("respiratoryER")}),
          Q("cancerType","Type and original site of cancer or tumor","text",{when:{key:"id",in:["cancer","leukemia"]}}),
          Q("cancerSpread","Has the cancer spread (metastasized), or been diagnosed more than once?","yn",{when:{key:"id",in:["cancer","leukemia"]}}),
          Q("cancerTherapy","Have you used tamoxifen, letrozole (Femara), or other long-term cancer treatment?","yn",{when:{key:"id",in:["cancer"]}}),
          Q("cancerTherapyDate","Most recent date of the cancer medication","date",{when:yes("cancerTherapy")}),
          Q("specialist","Treating specialist or clinic name and most recent visit (no patient numbers)","text")
        ],{when:yes("medicalHistory")}),
        Q("medicalComplete","Have you included all past and present physical diagnoses and treatments?","confirm")
      ],"The diagnosis and treatment dates allow reviewers to assess 2-, 3-, 5-, 7- and 10-year lookbacks without asking the same medical-condition question repeatedly."),
      G("5C. Recent medical care, investigations & procedures",[
        Q("covidComplications","Within the past six months, have you been treated for active COVID-19 or complications requiring hospitalization?"),
        Q("recentConsult","In the past 12 months, have you had a consultation, specialist referral, laboratory test, imaging, or ECG?"),
        Q("recentConsultDetails","Types of visits/tests and dates (no medical record numbers)","textarea",{when:yes("recentConsult")}),
        Q("hospitalHistory","Have you ever been hospitalized for a medical condition, beyond routine childbirth?"),
        R("hospitals","Hospital admission",[
          Q("date","Admission date","date"),Q("reason","Reason and outcome","textarea"),
          Q("facility","Facility name and city/state (optional)","text")
        ],{when:yes("hospitalHistory")}),
        Q("surgeryHistory","Have you ever had surgery, medical procedures, or weight-loss surgery?"),
        R("surgeries","Procedure or surgery",[
          Q("date","Procedure date","date"),Q("reason","Procedure and recovery details","textarea")
        ],{when:yes("surgeryHistory")}),
        Q("pendingCare","Are any tests, results, evaluation, treatment, or surgery recommended or still pending?"),
        Q("pendingDetails","Describe what is pending, the recommendation date, and when results are expected","textarea",{when:yes("pendingCare")}),
        Q("activeSymptoms","Do you have any medically unexplained symptoms still under investigation?"),
        Q("symptomDetails","Symptoms, first noticed date, and pending evaluation","textarea",{when:yes("activeSymptoms")}),
        Q("recentOpiates","Have you used prescription opioids for chronic pain within the last 12 months?")
      ]),
      G("5E. Weight, blood pressure, cholesterol & laboratory findings",[
        Q("weightChange","Has your weight changed substantially during the past 12 months?","choice",{options:[["none","No meaningful change"],["loss","Yes, weight loss"],["gain","Yes, weight gain"],["unknown","Unsure"]]}),
        Q("priorWeightLb","Approximate weight before the change (lb)","number",{when:{key:"weightChange",in:["loss","gain"]}}),
        Q("weightChangeDate","Approximate date the change occurred","date",{when:{key:"weightChange",in:["loss","gain"]}}),
        Q("weightCause","Reason for change","choice",{options:[["intentional","Diet, exercise or weight-loss medicine"],["illness","Illness"],["pregnancy","Pregnancy"],["surgery","Surgery"],["unknown","Unexplained / unsure"]],when:{key:"weightChange",in:["loss","gain"]}}),
        Q("stableSince","When did your weight become stable?","date",{when:{key:"weightChange",in:["loss","gain"]}}),
        Q("bpSys","Most recent systolic blood pressure (top number)","number"),
        Q("bpDia","Most recent diastolic blood pressure (bottom number)","number"),
        Q("bpDate","Blood-pressure reading date","date"),
        Q("bpBasis","Does the blood-pressure entry represent an individual reading or documented average?","choice",{options:[["current","Single reading"],["average_2yr","Two-year average"],["unknown","Unsure"]]}),
        Q("bpTreatment","Do you currently take prescribed treatment for high blood pressure?"),
        Q("bpControl","Has your doctor described your blood pressure as controlled?"),
        Q("cholTotal","Total cholesterol (mg/dL), if known","number"),
        Q("cholHdl","HDL cholesterol (mg/dL), if known","number"),
        Q("cholDate","Most recent cholesterol-test date","date"),
        Q("cholBasis","Does the cholesterol entry represent an individual test or an average?","choice",{options:[["current","Single test"],["average_12mo","12-month average"],["average_2yr","Two-year average"],["unknown","Unsure"]]}),
        Q("cholTreatment","Are you currently treated for high cholesterol?"),
        Q("lastPhysical","Month and year of last physical examination with blood work","month"),
        Q("abnormalLabs","Have any recent blood tests shown an abnormal result that your doctor is monitoring without medication?"),
        Q("abnormalLabsDetails","Which results were abnormal (such as A1c, cholesterol, kidney or liver function), and when?","textarea",{when:yes("abnormalLabs")})
      ]),
      G("5F. Prescription medications, including stopped or declined treatment",[
        Q("medicationHistory","Have you ever used a prescribed medication?"),
        R("medications","Prescription medication",[
          Q("name","Medicine name (no prescription number)","text"),
          Q("dose","Dose and usual frequency","text"),
          Q("indication","Condition for which it was prescribed","text"),
          Q("conditionId","Related disclosed physical diagnosis (if applicable)","conditionLinks"),
          Q("current","Are you currently taking this medicine?"),
          Q("start","When was it started?","date"),
          Q("lastFill","Most recent refill (approximate date)","date"),
          Q("end","When did you stop taking it?","date",{when:{key:"current",in:["no"]}}),
          Q("stopAdvice","Was stopping or changing the medicine recommended by your prescriber?","yn",{when:{key:"current",in:["no"]}})
        ],{when:yes("medicationHistory")}),
        Q("prescribedNotTaking","Are you choosing not to take a medication that is still prescribed or recommended for you?"),
        Q("prescribedNotTakingDetails","Medication, purpose and the reason it is not being taken","textarea",{when:yes("prescribedNotTaking")}),
        Q("medicationsComplete","Have you included all current medicines and any discontinued in the past five years?","confirm")
      ])
    ]),
    S("Mental Health History",[
      G("6. Mental health care and work impact",[
        Q("mentalHistory","Have you ever been diagnosed with, evaluated for, or treated for a mental health condition, including depression or anxiety?"),
        R("mentalConditions","Mental health condition",[
          Q("condition","Condition","choice",{options:[["anxiety","Anxiety / panic"],["depression","Depression"],["ptsd","PTSD"],["bipolar","Bipolar disorder"],["schizophrenia","Schizophrenia or psychotic disorder"],["ocd","Obsessive-compulsive disorder"],["eating","Eating disorder"],["other","Another mental health condition"]]}),
          Q("name","Specific condition if other","text",{when:{key:"condition",in:["other"]}}),
          Q("diagnosed","First diagnosis or treatment date","date"),
          Q("status","Current status / symptoms","text"),
          Q("treatment","Counseling, outpatient/inpatient care and other non-medication treatment (list medicines only in 5F)","textarea"),
          Q("lastVisit","Month/year of last mental-health appointment","month")
        ],{when:yes("mentalHistory")}),
        Q("mentalWorkImpact","In the past five years, has a mental health condition caused missed work or prevented you from working?","yn",{when:yes("mentalHistory")}),
        Q("mentalPsychiatricCare","In the past five years, have you consulted a psychiatrist or received hospital outpatient or inpatient psychiatric treatment?","yn",{when:yes("mentalHistory")}),
        Q("mentalSuicidalHistory","Have you ever had thoughts of ending your life or attempted suicide?","yn",{when:yes("mentalHistory")}),
        Q("mentalRiskNow","Are you currently having thoughts of harming yourself?","yn"),
        Q("mentalCareDetails","Additional mental-health history or treatment details you want the reviewer to know","textarea",{when:yes("mentalHistory")})
      ],"If you're in immediate danger, call 911. In the U.S., call or text 988 for confidential crisis support. This screening tool does not alert emergency services.")
    ]),
    S("Family Medical History",[
      G("7. Biological parents and siblings",[
        Q("familyHistory","Has a biological parent or sibling ever had a significant illness, major organ transplant, or a premature death?"),
        R("family","Family member's condition",[
          Q("member","Family member label (e.g., mother, father, sibling 1)","text"),
          Q("relation","Relationship","choice",{options:[["parent","Biological parent"],["sibling","Biological sibling"]]}),
          Q("disease","Disease or event","choice",{options:[["cardiovascular","Heart or circulatory disease"],["cerebrovascular","Stroke / cerebrovascular disease"],["cancer","Internal cancer, melanoma or blood cancer"],["kidney","Kidney disease"],["transplant","Major organ transplant"],["diabetes","Diabetes"],["huntington","Huntington's disease"],["polycystic_kidney","Polycystic kidney disease"],["other","Other serious disease"]]}),
          Q("cancerType","Site or type of cancer","text",{when:{key:"disease",in:["cancer"]}}),
          Q("diagnosisAge","Age when disease was first diagnosed","number"),
          Q("currentAge","Current age if living","number"),
          Q("death","Has this family member died?"),
          Q("deathAge","Age at death","number",{when:yes("death")}),
          Q("deathCause","Cause of death (if known)","text",{when:yes("death")})
        ],{when:yes("familyHistory")}),
        Q("familyComplete","Have you included all affected biological parents and siblings?","confirm")
      ],"Record each affected relative once; age at diagnosis and death support family-history screening before age 60.")
    ])
  );

  sections.push(
    S("Personal History — Alcohol & Substance Use",[
      G("8A. Alcohol use and counseling/treatment",[
        Q("alcoholPastYear","Have you consumed beer, wine, liquor, or other alcohol during the past 12 months?"),
        Q("alcoholType","Types of alcoholic drinks used","text",{when:yes("alcoholPastYear")}),
        Q("alcoholAmount","Typical number of standard drinks per day or week","text",{when:yes("alcoholPastYear")}),
        Q("alcoholLastDate","Date last consumed alcohol (if known)","date",{when:yes("alcoholPastYear")}),
        Q("alcoholProblem","Have you ever experienced problematic alcohol use, or been advised to cut down, stop, or obtain treatment?"),
        Q("alcoholProblemDate","When was alcohol counseling, advice, or treatment last received?","date",{when:yes("alcoholProblem")}),
        Q("alcoholProblemDetails","Describe counseling, treatment, relapses and outcome","textarea",{when:yes("alcoholProblem")})
      ],"One dated history supports 2-, 5-, 7- and 10-year counseling/treatment lookbacks."),
      G("8B. Marijuana, other drugs & prescription misuse",[
        Q("marijuana","Marijuana/cannabis use history","choice",{options:[["none","Never used"],["past","Former use"],["current","Currently recreational"],["medical","Currently medical"],["unknown","Unsure"]]}),
        Q("marijuanaLastDate","Most recent cannabis use date","date",{when:{key:"marijuana",in:["past","current","medical"]}}),
        Q("marijuanaDetails","Cannabis type/form, amount and frequency","text",{when:{key:"marijuana",in:["past","current","medical"]}}),
        Q("drugHistory","Have you ever used illicit or non-prescribed drugs, or taken prescription medicines differently from prescribed?"),
        R("substances","Substance or non-prescribed drug",[
          Q("name","Substance or drug (no dealer/source or prescription number)","text"),
          Q("firstDate","Approximate first use date","date"),
          Q("lastDate","Most recent use date","date"),
          Q("frequency","Amount, frequency, and how used (general terms)","textarea"),
          Q("treatment","Have you been advised to reduce/stop or receive treatment for this substance?"),
          Q("treatmentDate","Most recent advice or treatment date","date",{when:yes("treatment")})
        ],{when:yes("drugHistory")})
      ],"Enter the last-use and treatment dates once. Shorter 24-month, 5-, 7- and 10-year lookbacks are determined from dates, not separate repeated questions.")
    ]),
    S("Personal History — Driving Record (MVR)",[
      G("9. Driving privileges and traffic history",[
        Q("licenseStatus","Current driver's license status (do not enter its number)","choice",{options:[["valid","Valid"],["restricted","Valid with restrictions"],["never","Never held one"],["suspended","Suspended"],["revoked","Revoked"],["expired","Expired"],["unknown","Unsure"]]}),
        Q("licenseState","State that issued the license, if applicable","states",{when:{key:"licenseStatus",in:["valid","restricted","suspended","revoked","expired"]}}),
        Q("licenseRestrictedMedical","Do you have medically required restrictions on driving?"),
        Q("licenseAbsentReason","Why is a license unavailable or restricted?","choice",{options:[["medical","Medical"],["legal","Legal"],["choice","Personal choice / not needed"],["other","Other"]],when:{key:"licenseStatus",in:["restricted","never","suspended","revoked","expired"]}}),
        Q("licenseAbsentDetails","Describe the relevant medical or legal restriction (without identifying numbers)","textarea",{when:{key:"licenseAbsentReason",in:["medical","legal"]}}),
        Q("drivingHistory","Have you ever had a DUI/DWI, a driving conviction, moving violation, accident, or license suspension/revocation?"),
        R("driving","Driving incident",[
          Q("type","Incident type","choice",{options:[["minor","Minor moving violation"],["speeding","Speeding"],["serious","Serious moving violation"],["reckless","Reckless / careless driving"],["dui","DUI / DWI"],["suspension","License suspended"],["revocation","License revoked"],["accident","Traffic accident"]]}),
          Q("date","Date of incident","date"),
          Q("details","General circumstances and outcome (no citation or case number)","textarea"),
          Q("injury","Were there injuries or a medical driving restriction?"),
          Q("speed","Speed driven, if known (mph)","number",{when:{key:"type",in:["speeding"]}}),
          Q("mphOver","Miles above speed limit, if known","number",{when:{key:"type",in:["speeding"]}})
        ],{when:yes("drivingHistory")}),
        Q("drivingComplete","Have you entered each separate driving incident, including accidents?","confirm")
      ],"Provide each incident once with its date; the record supports 24-month, three-, five- and eight-year checks. License numbers and citations are not collected.")
    ]),
    S("Personal History — Criminal & Legal History",[
      G("10A. Convictions and pending charges",[
        Q("criminalHistory","Have you ever been arrested, charged, convicted, or entered a plea for a felony or misdemeanor?"),
        R("criminal","Criminal/legal incident",[
          Q("type","Type of incident","choice",{options:[["felony","Felony"],["misdemeanor","Misdemeanor"],["arrest","Arrest / charge without conviction"]]}),
          Q("offense","General nature of offense (no case or docket number)","textarea"),
          Q("date","Arrest or charge date","date"),
          Q("disposition","Case outcome","choice",{options:[["convicted","Conviction / guilty or no contest plea"],["pending","Pending"],["dismissed","Dismissed or acquitted"],["other","Other / unknown"]]}),
          Q("convictionDate","Conviction or plea date","date",{when:{key:"disposition",in:["convicted"]}}),
          Q("jail","Did the sentence involve incarceration?"),
          Q("jailEnd","Release / completion date","date",{when:yes("jail")}),
          Q("probation","Did the sentence involve probation?"),
          Q("probationEnd","Probation completion date","date",{when:yes("probation")}),
          Q("parole","Did the sentence involve parole?"),
          Q("paroleEnd","Parole completion date","date",{when:yes("parole")})
        ],{when:yes("criminalHistory")}),
        Q("pendingCharges","Are any criminal charges currently pending?"),
        Q("criminalComplete","Have you listed every applicable incident (not counting DUI/DWI already recorded in Driving)?","confirm")
      ],"Dates are used for 5-, 7- and 10-year lookbacks. Do not enter case or docket numbers, or re-enter a DUI/DWI already disclosed in Section 9."),
      G("10B. Incarceration, probation & parole",[
        Q("incarcerated","Are you currently incarcerated?"),
        Q("probationCurrent","Are you currently on probation or court-ordered supervision?"),
        Q("paroleCurrent","Are you currently on parole?"),
        Q("supervisionRecent","Have you been released from incarceration or court supervision within the past 10 years?"),
        Q("supervisionRelease","Most recent release or supervision-completion date","date",{when:yes("supervisionRecent")})
      ])
    ]),
    S("Personal History — Aviation & Hazardous Avocations",[
      G("11A. Private, recreational & occupational aviation",[
        Q("aviation","Outside the military aviation already reported, have you flown or do you intend to fly as a pilot, student pilot, or flight crew member?"),
        R("flights","Flying category",[
          Q("kind","Type of flying","choice",{options:[["commercial","Commercial or professional aviation"],["company","Company-owned aircraft"],["student","Flight training"],["pleasure","Recreational / private pleasure"],["other","Other"]]}),
          Q("role","Role and typical aircraft type","text"),
          Q("lastFlight","Date last flown","date"),
          Q("nextFlight","Next intended flight date, if known","date"),
          Q("hours","Approximate flight hours in the past year","number"),
          Q("details","Missions or operations (including any special risks)","textarea")
        ],{when:yes("aviation")})
      ],"Aviation history covers prior 12- and 24-month experience and planned flights for the next two years. This questionnaire does not select policy exclusions or premiums."),
      G("11B. Hazardous sports, racing & outdoor activities",[
        Q("hazardousSports","Have you participated in, or do you plan to participate in, hazardous activities such as skydiving, paragliding, climbing, scuba diving, racing or professional sports?"),
        R("avocations","Sport or hazardous activity",[
          Q("kind","Activity","choice",{options:[["climbing","Rock / ice / mountain climbing"],["scuba","Scuba, cave or deep diving"],["skydiving","Skydiving / parachuting / BASE jumping"],["paragliding","Paragliding / hang gliding"],["racing","Auto, motorcycle, boat or other racing"],["rodeo","Rodeo"],["professional","Professional sports"],["other","Another hazardous activity"]]}),
          Q("lastDate","Most recent activity date","date"),
          Q("nextDate","Next planned activity date, if any","date"),
          Q("frequency","How often and for how long?","text"),
          Q("details","Equipment, skill level, locations and exposure (general terms)","textarea"),
          Q("soloUnroped","Do you climb alone or without ropes?","yn",{when:{key:"kind",in:["climbing"]}}),
          Q("scubaSalvage","Do you dive for salvage, exploration, or in caves?","yn",{when:{key:"kind",in:["scuba"]}}),
          Q("scubaDepth","Maximum typical depth in feet","number",{when:{key:"kind",in:["scuba"]}}),
          Q("raceType","Vehicle type, track or course and whether professional/paid","textarea",{when:{key:"kind",in:["racing"]}}),
          Q("jumpType","Type of jumps/gliding and number per year","text",{when:{key:"kind",in:["skydiving","paragliding"]}})
        ],{when:yes("hazardousSports")})
      ],"Include activities within the last five years and expected in the next two years. Each unique activity is entered once."),
      G("Final review",[
        Q("historyConfirmed","Have you reviewed and confirmed all answers, including medical history, prescriptions, and dated events?","confirm")
      ],"This is preliminary, self-reported screening only, not an official application or binding carrier health-class decision.")
    ])
  );
  return {sections,conditions};
})();
