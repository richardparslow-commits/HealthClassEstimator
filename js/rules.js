/* Source-edition underwriting data. No inferred cross-product medical ratings.
 * Physical PDF pages include covers. Supplied editions are not a promise of
 * current availability; partial/unverified profiles cannot return a final class.
 */
"use strict";
const RULE_SOURCES = {
  "F-SF-SPECS": {
    "title": "Foresters Strong Foundation product guide",
    "edition": "506308 US (04/25); supplied edition reviewed 2026-10-10",
    "pages": [
      3,
      4
    ],
    "file": "Foresters/\\-foresters-strong-foundation-product-guidee.pdf",
    "sha256": "616c28bbeda2b5d89bba5d4107360de2c2f4933b95c04430bd01dbb83e878b5c"
  },
  "F-SMART-SPECS": {
    "title": "Foresters SMART UL product guide",
    "edition": "503346 US (04/25); current official link checked 2026-10-10",
    "pages": [
      3
    ],
    "url": "https://ezbiz.foresters.com/foresters-smart-ul-product-guide",
    "sha256": "3a5beb47621628a0927aba83b16b652f527c740ae65a6207935d683b78225287"
  },
  "FG-PS-SPECS": {
    "title": "F&G Pathsetter at a glance",
    "edition": "ADV2260; Rev. 03-2026 26-0211; current official link checked 2026-10-10",
    "pages": [
      1,
      7
    ],
    "url": "https://assets.fglife.com/is/content/fglife/ad-reviewed-materials/adv/adv2200s/ADV2260%20FG%20Pathsetter%20%28AAG%29-Standard.pdf",
    "sha256": "0b29de834aa5b735a720238cccd61088df6abaec9193678d4615454427a85dd4"
  },
  "UHL-PORTFOLIO": {
    "title": "United Home Life product portfolio",
    "edition": "200-691 3-26; current official link checked 2026-10-10",
    "pages": [
      1,
      2
    ],
    "url": "https://www.unitedhomelife.com/docs/default-source/agent-portal-resources/documents/marketing-materials/marketing-support/product-portfolio-reference-guide.pdf?sfvrsn=b3b8137a_17",
    "sha256": "9b53bb754c575d46b54e51d0445c70712a8f7c3e7e4b467a839bf9f8ead237c8"
  },
  "B-FIELD": {
    "title": "Banner OPTerm field guide",
    "edition": "March 2026",
    "pages": [
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      14
    ],
    "url": "https://www.bannerlife.com/docs/default-source/advisor/underwriting/underwriting-field-guide.pdf?sfvrsn=7597fac7_70"
  },
  "B-SPECS": {
    "title": "Banner OPTerm product specifications",
    "edition": "CN04022026-3; retrieved 2026-10-08",
    "pages": [
      1,
      2
    ],
    "url": "https://www.bannerlife.com/docs/default-source/advisor/term/opterm-product-specs.pdf"
  },
  "D084": {
    "title": "Banner BeyondTerm product information",
    "edition": "CN11072025-4",
    "pages": [
      1
    ],
    "file": "Banner Life/product-specifications3.pdf",
    "sha256": "26be4ef54b4e60d81b42794d27d40bbe0cf527b817c01dc20e90e50efdf8da80"
  },
  "D085": {
    "title": "Banner BeyondTermflex product specifications",
    "edition": "CN08282026-6 (August 2026)",
    "pages": [
      1,
      2
    ],
    "file": "Banner Life/product-specifications_flex.pdf",
    "sha256": "5365bb79002e9a9783d2164c10683a43ed464df596464647c2bb669ee05e20b5"
  },
  "BF-INFO": {
    "title": "Banner BeyondTermflex product information",
    "edition": "CN08282026-5 (August 2026)",
    "pages": [
      1,
      2
    ],
    "file": "Banner Life/product-information_flex.pdf",
    "sha256": "005316a8b7a26c3639cb91c20f341479e38a041b2c3b5ed4564da5f83b336619"
  },
  "D235": {
    "title": "Foresters Your Term product guide",
    "edition": "506307 US (04/26)",
    "pages": [
      3
    ],
    "file": "Foresters/foresters-your-term-product-guide.pdf",
    "sha256": "1c1c0b616017aaf62f0c737dd458ac213e9190388eb6f75b52fd183aff981f75"
  },
  "D183": {
    "title": "Foresters Advantage Plus II product guide",
    "edition": "504933 US (04/25)",
    "pages": [
      3
    ],
    "file": "Foresters/foresters-advantage-plus-ii-product-guide.pdf",
    "sha256": "d6363fbf590df681c13f5d914ca454641300b814a24c2d1feaf76bae258c659b"
  },
  "D398": {
    "title": "Transamerica Trendsetter term life guide",
    "edition": "Supplied product guide; verify current availability",
    "pages": [
      5,
      7
    ],
    "file": "Transamerica/Transamerica_Trendsetter\u2026.pdf",
    "sha256": "82fb188c3059c402d28251f518fb4acc83aefc40f0a73420007b63353253a52c"
  },
  "D077": {
    "title": "Banner BeyondTerm / BeyondTermflex underwriting guide",
    "edition": "September 2026",
    "pages": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      13
    ],
    "file": "Banner Life/beyondterm-flex_underwriting-guide.pdf",
    "sha256": "99a7fafdc0017a774ee9533ff82bfca69e5b9925f1aab94ab18af5bb594d3ad2"
  },
  "D152": {
    "title": "Foresters Your Term / Advantage Plus II / SMART UL / Strong Foundation underwriting guide",
    "edition": "506305 US (04/26)",
    "pages": [
      5,
      7,
      8,
      9,
      10,
      18
    ],
    "file": "Foresters/2foresters-underwriting-guide-yt-sf-term-adv-plus-smart-ul.pdf",
    "sha256": "2913e5dcd83b8904fc70910d6c929cba17b42a16fbb41fbc1f0345eb69d78601"
  },
  "D199": {
    "title": "Foresters immigration guidelines",
    "edition": "417233 US (12/24)",
    "pages": [
      1,
      2
    ],
    "file": "Foresters/foresters-immigration-guideline-non-us-citizens.pdf",
    "sha256": "edaca12c365a5fd07e88fd53ffea7176f44a346c40b9079b4bec2b519b14a087"
  },
  "D282": {
    "title": "United of Omaha fully underwritten life guide",
    "edition": "619000_0224 (February 2024)",
    "pages": [
      5,
      6,
      7,
      11,
      12,
      13,
      23,
      38
    ],
    "file": "Mutual of Omaha/moo-fully-underwritten-life-insurance-uw-guidelines-updated-91625.pdf",
    "sha256": "d58ec2cb36e2f9903805f62eca520cf09917c624a86f17f549c19380203b8cf4"
  },
  "D295": {
    "title": "Mutual of Omaha simplified issue underwriting guide",
    "edition": "618352_0124 (January 2024)",
    "pages": [
      7,
      22
    ],
    "file": "Mutual of Omaha/moo-simplified-issue-life-uw-guide-updated-91625.pdf",
    "sha256": "c5e4e64c4d4d8f2665b64cb87462ce4b5612fffef62d042bd389f8dadd4b82fb"
  },
  "D299": {
    "title": "Mutual of Omaha Term Life Express brochure",
    "edition": "283976_0426 (April 2026)",
    "pages": [
      1,
      2
    ],
    "file": "Mutual of Omaha/moo-term-life-express-product-guide-updated-91625.pdf",
    "sha256": "165aa893e8362347a1688c23788d9e0b439744df542b7f4f09c70671170c391d"
  },
  "D286": {
    "title": "Mutual of Omaha IUL Express product guide",
    "edition": "457978_0426 (April 2026)",
    "pages": [
      7
    ],
    "file": "Mutual of Omaha/moo-iul-express-product-guide-updated-91625.pdf",
    "sha256": "45af62baa51e8239b86d24fd0608a0001692a65c6934ce37e24186b667d04454"
  },
  "D141": {
    "title": "F&G Quantum underwriting guidelines",
    "edition": "ADV5691 (07-2025)",
    "pages": [
      4,
      8,
      9,
      10,
      11,
      12,
      13
    ],
    "file": "F&G/fg-quantum-underwriting-guidelines.pdf",
    "sha256": "1f13592c8e0be2a474482dc71ce0c6c8441305cb174d91ead2684c33f1c398ec"
  },
  "D121": {
    "title": "F&G general underwriting guidelines",
    "edition": "Local supplied edition; product rules unresolved",
    "pages": [
      11,
      12,
      18,
      19,
      20,
      21,
      22
    ],
    "file": "F&G/F&G - General Underwriting Guidelines_Em8XhO4.pdf",
    "sha256": "1d6c4911db06ff7c725ad81c7f81fb3e075519a9ed04fbce4983479cc0251164"
  },
  "D370": {
    "title": "Transamerica Field Guide to Underwriting",
    "edition": "03/25",
    "pages": [
      5,
      11,
      12,
      18,
      20,
      21,
      26,
      27,
      42,
      48,
      49
    ],
    "file": "Transamerica/Field_Guide_to_Underwriting.pdf",
    "sha256": "63fd69e8ca7e5dd00be471ee79de97c0eb1cd1b6532377cce345114737ac652d"
  },
  "D105": {
    "title": "Corebridge SimpliNow Legacy product guide",
    "edition": "AGLC201192 REV0822",
    "pages": [
      7,
      9
    ],
    "file": "Corebridge Financial/SIWL Guide_0Q6FGjW.pdf",
    "sha256": "e0b1d75f73784b98070d38c809046e170251051b5065e11e1f632af506f224c6"
  },
  "D106": {
    "title": "Corebridge SimpliNow Legacy SIWL underwriting guide",
    "edition": "AGLC201453 REV0424",
    "pages": [
      2,
      3,
      4,
      5,
      6,
      7,
      8
    ],
    "file": "Corebridge Financial/SIWL UW Guide_cXrbDfI.pdf",
    "sha256": "6d51fdd6ca8e59fac15d64424af32fcbf5c0cfc6bfd78a53cc62bc0937998844"
  },
  "AM-QSFP-INFO": {
    "title": "Quility Secure Future Preferred product information",
    "edition": "Created by QMKTG 07-17-2026; reviewed 2026-10-09",
    "pages": [1],
    "file": "American Amicable/AM AM secure future.pdf",
    "sha256": "72b4edc9bdc3fda0b4d83661d778549fee95518d35e47f49d2069ef5bca25551",
    "url": "https://navigator-help.quility.com/hc/en-us/articles/46241491592219-Whole-Life-AmAm-UHL-vs-Term-Life-Banner-Life-SBLI-vs-IUL-F-G-in-Navigator"
  },
  "AM-QSFP-FAQ": {
    "title": "Quility Secure Future Preferred FAQs",
    "edition": "Created by QTG 10.2.2026; reviewed 2026-10-09",
    "pages": [2],
    "file": "American Amicable/QSFP_by_AmAm_FAQs_10.2026_ojEpXbK.pdf",
    "sha256": "bac0b143f3706ac879964f8780e49566409af830daefa5b7abad8a7d01d056a0"
  },
  "D017": {
    "title": "Quility Secure Future Preferred prescription reference",
    "edition": "November 18, 2025",
    "pages": [
      1,
      2,
      3,
      4
    ],
    "file": "American Amicable/Quility_Secure_Future_Preferred_AmAm_Prescription_Reference_Guide_11.18.25_F2MbAgN.pdf",
    "sha256": "3292ec0a3982808ac5fba222437bafb3689b3d76bcd102dfb955b96cbbc602c9"
  },
  "D016": {
    "title": "Quility Secure Future Preferred declinable conditions",
    "edition": "November 18, 2025",
    "pages": [
      1
    ],
    "file": "American Amicable/Quility_Secure_Future_Preferred_AmAm_DCL_Condition_Guide_11.18.25_MdTfdSd.pdf",
    "sha256": "e3fa429d2dcbc9aa5161eae947b0d9674e7181a096c682018b5f2a5083d4c4e8"
  },
  "SB-ET-SPECS": {
    "title": "SBLI EasyTrak Digital Term at a glance",
    "edition": "26-4107, May 2026; reviewed 2026-10-09",
    "pages": [
      1,
      2
    ],
    "file": "SBLI/ET-at-a-glance-5-26-1.pdf",
    "sha256": "d162dadf2d684f359d4611230d4c8f5e988129062a7b2b14f2ad145c4dc2df6b"
  },
  "SB-ET-GUIDE": {
    "title": "SBLI EasyTrak Digital Term Quility agent guide",
    "edition": "Supplied 26-4154 (Quility); reviewed 2026-10-09",
    "pages": [
      4,
      5
    ],
    "file": "SBLI/-Quility-ET-agent-guide-PV-3.pdf",
    "sha256": "7691a5a3f953d6d4fb2c5312df52042ba7421f5078394570541bf33d81aaeac5"
  },
  "SB-ET-FAQ": {
    "title": "Quility Navigator SBLI EasyTrak FAQs",
    "edition": "Updated May 12, 2026; checked 2026-10-09",
    "pages": [],
    "url": "https://navigator-support.quility.com/hc/en-us/articles/50288882119067-SBLI-EasyTrak-FAQs"
  },
  "D347": {
    "title": "SBLI EasyTrak Digital Term agent guide",
    "edition": "Supplied 42325 file",
    "pages": [
      4,
      10,
      11
    ],
    "file": "SBLI/easytrak-digital-term-agent-guide-42325pdf.pdf",
    "sha256": "f94be014a9d1314f1e19cc211c7232f43879edb98ff4687a5907e4cfbd1afff4"
  },
  "D309": {
    "title": "Royal Neighbors field underwriting guide",
    "edition": "2980-B Rev. 3-2020",
    "pages": [
      9,
      15
    ],
    "file": "Royal/Royal Neighbors Field Underwriting Guidelines_QugmaIs.pdf",
    "sha256": "41721b288b3675fbc436e87e2cd2b13029139987d2450890834030f859302dd1"
  },
  "D459": {
    "title": "United Home Life Texas term application",
    "edition": "ICC22 200-878A (6-22)",
    "pages": [
      5,
      7
    ],
    "file": "United Home Life/Term_Life_Application_-_Texas.pdf",
    "sha256": "93c92d5ed19811b1d51215e0d165a72780d7b164ef361305a9da9a193959770e"
  },
  "D404": {
    "title": "United Home Life agent guide",
    "edition": "September 2026",
    "pages": [
      1
    ],
    "file": "United Home Life/200-920-uw-guide-9-26.pdf",
    "sha256": "b896f8bea10c06d82159ff3286faf0d6976fbc6e91491f1eed439a4d94b8a8e1"
  },
  "AM-ES-SPECS": {
    "title": "Americo Eagle Select reference sheet",
    "edition": "24-275-8 (03/26); checked 2026-10-09",
    "pages": [
      1
    ],
    "url": "https://americofinalexpense.com/ES/FinalExpenseQuickReference.pdf",
    "file": "Americo/FinalExpenseQuickReferenceSheet.pdf",
    "sha256": "ee3522e7b485156a7a735dd077ad279d8664dbcf96033a66549bae0ae609474c"
  },
  "AM-ES-GUIDE": {
    "title": "Americo Eagle Select agent guide",
    "edition": "24-275-1 (01/26)",
    "pages": [
      6,
      7,
      10,
      11
    ],
    "url": "https://americofinalexpense.com/ES/ESFinalExpenseAgentGuide.pdf",
    "file": "Americo/AgentGuide.pdf",
    "sha256": "066d798a0b1a14e7dca406f82da81482b8c2102b73358956f301683b410df4bc"
  },
  "QTP-LEGACY": {
    "title": "Quility Term Plus legacy underwriting guide",
    "edition": "Effective September 11, 2024; CN11182024-4; identity reference only",
    "pages": [
      1,
      3,
      7,
      9
    ],
    "url": "https://www.bannerlife.com/docs/default-source/advisor/products/quility/quility-term-plus_underwriting-guide.pdf?sfvrsn=25620979_4"
  },
  "QTP-RENAME": {
    "title": "Quility support: Banner Life application and BeyondTerm naming",
    "edition": "Updated February 11, 2026; checked 2026-10-09; product identity only",
    "pages": [],
    "url": "https://navigator-support.quility.com/hc/en-us/articles/44242964353179-Download-Banner-Life-Application"
  },
  "NLG-PRODUCT": {
    "title": "National Life Group consumer life insurance overview",
    "edition": "Checked 2026-10-09; product reference only, no product-specific underwriting criteria",
    "pages": [],
    "url": "https://www.nationallife.com/Individuals-Families/Life-Insurance"
  },
  "JH-PRODUCT": {
    "title": "John Hancock Vitality product overview",
    "edition": "Checked 2026-10-09; Simple Term name reference only, no underwriting criteria",
    "pages": [],
    "url": "https://www.johnhancock.com/individual/life-insurance/vitality"
  }
};
const BUILD_CHARTS = {
  "americo": {
    "56": [
        79,
        198
    ],
    "57": [
        81,
        205
    ],
    "58": [
        84,
        212
    ],
    "59": [
        87,
        220
    ],
    "60": [
        90,
        227
    ],
    "61": [
        93,
        235
    ],
    "62": [
        96,
        243
    ],
    "63": [
        99,
        251
    ],
    "64": [
        102,
        259
    ],
    "65": [
        106,
        267
    ],
    "66": [
        109,
        275
    ],
    "67": [
        112,
        284
    ],
    "68": [
        116,
        292
    ],
    "69": [
        119,
        301
    ],
    "70": [
        122,
        310
    ],
    "71": [
        126,
        319
    ],
    "72": [
        130,
        328
    ],
    "73": [
        133,
        337
    ],
    "74": [
        137,
        346
    ],
    "75": [
        141,
        356
    ],
    "76": [
        144,
        365
    ],
    "77": [
        148,
        375
    ],
    "78": [
        152,
        385
    ],
    "79": [
        156,
        395
    ]
},"banner":{"58":{"pp":134,"p":144,"sp":155,"stdCredit":181,"std":196,"min":89},"59":{"pp":139,"p":149,"sp":160,"stdCredit":188,"std":203,"min":92},"60":{"pp":144,"p":154,"sp":166,"stdCredit":194,"std":209,"min":95},"61":{"pp":149,"p":159,"sp":171,"stdCredit":201,"std":216,"min":98},"62":{"pp":153,"p":164,"sp":177,"stdCredit":207,"std":224,"min":101},"63":{"pp":158,"p":170,"sp":183,"stdCredit":214,"std":231,"min":104},"64":{"pp":164,"p":175,"sp":188,"stdCredit":221,"std":238,"min":108},"65":{"pp":169,"p":181,"sp":194,"stdCredit":228,"std":246,"min":111},"66":{"pp":174,"p":186,"sp":200,"stdCredit":235,"std":253,"min":115},"67":{"pp":179,"p":192,"sp":207,"stdCredit":242,"std":261,"min":118},"68":{"pp":185,"p":198,"sp":213,"stdCredit":249,"std":269,"min":122},"69":{"pp":190,"p":204,"sp":219,"stdCredit":257,"std":277,"min":125},"70":{"pp":196,"p":210,"sp":225,"stdCredit":264,"std":285,"min":129},"71":{"pp":201,"p":216,"sp":232,"stdCredit":272,"std":293,"min":133},"72":{"pp":207,"p":222,"sp":239,"stdCredit":279,"std":302,"min":136},"73":{"pp":213,"p":228,"sp":245,"stdCredit":287,"std":310,"min":140},"74":{"pp":219,"p":234,"sp":252,"stdCredit":295,"std":319,"min":144},"75":{"pp":225,"p":241,"sp":259,"stdCredit":303,"std":327,"min":148},"76":{"pp":231,"p":247,"sp":266,"stdCredit":311,"std":336,"min":152},"77":{"pp":237,"p":254,"sp":273,"stdCredit":320,"std":345,"min":156},"78":{"pp":243,"p":260,"sp":280,"stdCredit":328,"std":354,"min":160},"79":{"pp":249,"p":267,"sp":287,"stdCredit":336,"std":363,"min":164},"80":{"pp":256,"p":274,"sp":295,"stdCredit":345,"std":372,"min":168},"81":{"pp":262,"p":281,"sp":302,"stdCredit":354,"std":382,"min":173},"82":{"pp":268,"p":288,"sp":309,"stdCredit":363,"std":391,"min":177},"83":{"pp":275,"p":295,"sp":317,"stdCredit":371,"std":401,"min":181}},"foresters":{"56":{"pp":118,"p":125,"sp":143,"std":162},"57":{"pp":122,"p":130,"sp":150,"std":168},"58":{"pp":126,"p":135,"sp":155,"std":174},"59":{"pp":130,"p":137,"sp":160,"std":180},"60":{"pp":144,"p":152,"sp":167,"std":186},"61":{"pp":149,"p":158,"sp":175,"std":193},"62":{"pp":152,"p":162,"sp":180,"std":199},"63":{"pp":157,"p":166,"sp":185,"std":206},"64":{"pp":161,"p":172,"sp":190,"std":211},"65":{"pp":166,"p":178,"sp":195,"std":219},"66":{"pp":170,"p":182,"sp":200,"std":226},"67":{"pp":176,"p":190,"sp":205,"std":233},"68":{"pp":180,"p":195,"sp":210,"std":240},"69":{"pp":184,"p":200,"sp":215,"std":247},"70":{"pp":190,"p":205,"sp":222,"std":254},"71":{"pp":196,"p":210,"sp":227,"std":261},"72":{"pp":202,"p":220,"sp":234,"std":269},"73":{"pp":206,"p":225,"sp":242,"std":276},"74":{"pp":211,"p":230,"sp":247,"std":284},"75":{"pp":216,"p":240,"sp":252,"std":292},"76":{"pp":221,"p":244,"sp":258,"std":299},"77":{"pp":227,"p":251,"sp":264,"std":307},"78":{"pp":244,"p":260,"sp":270,"std":315},"79":{"pp":249,"p":265,"sp":276,"std":323},"80":{"pp":254,"p":270,"sp":281,"std":332},"81":{"pp":259,"p":273,"sp":285,"std":340}},"mutual_of_omaha":{"56":{"pp":125,"p":144,"sp":153,"stdCredit":158,"std":158,"t1":170,"t2":184,"t3":190,"t4":197,"t5":204,"t6":212,"t8":221,"t10":230,"t12":240},"57":{"pp":131,"p":150,"sp":160,"stdCredit":165,"std":165,"t1":176,"t2":189,"t3":195,"t4":202,"t5":209,"t6":216,"t8":225,"t10":234,"t12":244},"58":{"pp":135,"p":155,"sp":165,"stdCredit":170,"std":170,"t1":182,"t2":194,"t3":201,"t4":208,"t5":214,"t6":222,"t8":231,"t10":240,"t12":249},"59":{"pp":141,"p":160,"sp":170,"stdCredit":176,"std":176,"t1":187,"t2":199,"t3":207,"t4":214,"t5":220,"t6":228,"t8":237,"t10":245,"t12":254},"60":{"pp":146,"p":166,"sp":177,"stdCredit":184,"std":184,"t1":193,"t2":205,"t3":213,"t4":220,"t5":226,"t6":235,"t8":244,"t10":253,"t12":262},"61":{"pp":152,"p":173,"sp":185,"stdCredit":191,"std":191,"t1":199,"t2":211,"t3":218,"t4":226,"t5":233,"t6":242,"t8":250,"t10":259,"t12":269},"62":{"pp":158,"p":179,"sp":190,"stdCredit":197,"std":197,"t1":205,"t2":215,"t3":223,"t4":232,"t5":239,"t6":248,"t8":257,"t10":266,"t12":277},"63":{"pp":164,"p":184,"sp":195,"stdCredit":203,"std":203,"t1":213,"t2":220,"t3":228,"t4":238,"t5":246,"t6":255,"t8":264,"t10":275,"t12":284},"64":{"pp":169,"p":189,"sp":200,"stdCredit":209,"std":209,"t1":221,"t2":225,"t3":235,"t4":245,"t5":252,"t6":261,"t8":270,"t10":281,"t12":292},"65":{"pp":174,"p":194,"sp":205,"stdCredit":215,"std":215,"t1":226,"t2":231,"t3":242,"t4":251,"t5":259,"t6":268,"t8":277,"t10":286,"t12":299},"66":{"pp":180,"p":200,"sp":210,"stdCredit":222,"std":222,"t1":232,"t2":239,"t3":248,"t4":258,"t5":268,"t6":276,"t8":285,"t10":293,"t12":308},"67":{"pp":185,"p":205,"sp":215,"stdCredit":228,"std":228,"t1":239,"t2":245,"t3":254,"t4":265,"t5":275,"t6":284,"t8":293,"t10":303,"t12":316},"68":{"pp":189,"p":209,"sp":220,"stdCredit":235,"std":235,"t1":246,"t2":251,"t3":262,"t4":274,"t5":283,"t6":291,"t8":300,"t10":312,"t12":324},"69":{"pp":195,"p":215,"sp":225,"stdCredit":242,"std":242,"t1":254,"t2":258,"t3":270,"t4":282,"t5":291,"t6":299,"t8":309,"t10":319,"t12":331},"70":{"pp":200,"p":221,"sp":232,"stdCredit":250,"std":250,"t1":262,"t2":266,"t3":278,"t4":289,"t5":300,"t6":307,"t8":316,"t10":327,"t12":340},"71":{"pp":206,"p":227,"sp":237,"stdCredit":258,"std":258,"t1":269,"t2":274,"t3":287,"t4":298,"t5":307,"t6":315,"t8":325,"t10":339,"t12":349},"72":{"pp":211,"p":232,"sp":244,"stdCredit":265,"std":265,"t1":275,"t2":281,"t3":292,"t4":305,"t5":315,"t6":322,"t8":333,"t10":348,"t12":356},"73":{"pp":217,"p":239,"sp":252,"stdCredit":271,"std":271,"t1":282,"t2":289,"t3":300,"t4":313,"t5":322,"t6":330,"t8":340,"t10":355,"t12":365},"74":{"pp":222,"p":244,"sp":257,"stdCredit":279,"std":279,"t1":289,"t2":296,"t3":308,"t4":321,"t5":331,"t6":339,"t8":349,"t10":366,"t12":374},"75":{"pp":228,"p":250,"sp":262,"stdCredit":285,"std":285,"t1":296,"t2":303,"t3":317,"t4":329,"t5":339,"t6":348,"t8":358,"t10":376,"t12":383},"76":{"pp":233,"p":255,"sp":268,"stdCredit":292,"std":292,"t1":301,"t2":311,"t3":325,"t4":338,"t5":348,"t6":357,"t8":367,"t10":385,"t12":394},"77":{"pp":239,"p":261,"sp":274,"stdCredit":298,"std":298,"t1":307,"t2":319,"t3":334,"t4":347,"t5":357,"t6":366,"t8":376,"t10":393,"t12":402},"78":{"pp":246,"p":268,"sp":280,"stdCredit":307,"std":307,"t1":313,"t2":328,"t3":345,"t4":358,"t5":366,"t6":375,"t8":385,"t10":405,"t12":413},"79":{"pp":252,"p":274,"sp":286,"stdCredit":313,"std":313,"t1":320,"t2":336,"t3":354,"t4":367,"t5":375,"t6":384,"t8":394,"t10":413,"t12":422},"80":{"pp":258,"p":280,"sp":294,"stdCredit":320,"std":320,"t1":327,"t2":345,"t3":363,"t4":376,"t5":385,"t6":395,"t8":405,"t10":422,"t12":431},"81":{"pp":264,"p":287,"sp":302,"stdCredit":326,"std":326,"t1":335,"t2":352,"t3":372,"t4":385,"t5":395,"t6":406,"t8":415,"t10":435,"t12":444},"82":{"pp":270,"p":294,"sp":310,"stdCredit":334,"std":334,"t1":343,"t2":359,"t3":382,"t4":395,"t5":407,"t6":418,"t8":427,"t10":444,"t12":462}},"fg_quantum":{"56":{"male":{"pp":166,"std":183},"female":{"pp":152,"std":167},"min":74,"tableMax":198},"57":{"male":{"pp":170,"std":187},"female":{"pp":155,"std":171},"min":77,"tableMax":205},"58":{"male":{"pp":174,"std":191},"female":{"pp":157,"std":173},"min":79,"tableMax":212},"59":{"male":{"pp":178,"std":196},"female":{"pp":160,"std":176},"min":82,"tableMax":220},"60":{"male":{"pp":182,"std":200},"female":{"pp":163,"std":179},"min":85,"tableMax":227},"61":{"male":{"pp":186,"std":205},"female":{"pp":166,"std":183},"min":88,"tableMax":235},"62":{"male":{"pp":190,"std":209},"female":{"pp":169,"std":186},"min":91,"tableMax":243},"63":{"male":{"pp":196,"std":216},"female":{"pp":174,"std":191},"min":94,"tableMax":251},"64":{"male":{"pp":202,"std":222},"female":{"pp":179,"std":197},"min":97,"tableMax":259},"65":{"male":{"pp":207,"std":228},"female":{"pp":183,"std":201},"min":100,"tableMax":267},"66":{"male":{"pp":213,"std":234},"female":{"pp":189,"std":208},"min":103,"tableMax":275},"67":{"male":{"pp":217,"std":239},"female":{"pp":193,"std":212},"min":106,"tableMax":284},"68":{"male":{"pp":223,"std":245},"female":{"pp":198,"std":218},"min":109,"tableMax":292},"69":{"male":{"pp":228,"std":251},"female":{"pp":202,"std":222},"min":112,"tableMax":301},"70":{"male":{"pp":235,"std":259},"female":{"pp":208,"std":229},"min":115,"tableMax":310},"71":{"male":{"pp":241,"std":265},"female":{"pp":214,"std":235},"min":119,"tableMax":319},"72":{"male":{"pp":248,"std":273},"female":{"pp":221,"std":243},"min":122,"tableMax":328},"73":{"male":{"pp":253,"std":278},"female":{"pp":225,"std":248},"min":126,"tableMax":337},"74":{"male":{"pp":260,"std":286},"female":{"pp":232,"std":255},"min":129,"tableMax":346},"75":{"male":{"pp":267,"std":294},"female":{"pp":237,"std":261},"min":133,"tableMax":355},"76":{"male":{"pp":276,"std":304},"female":{"pp":246,"std":271},"min":136,"tableMax":365},"77":{"male":{"pp":284,"std":312},"female":{"pp":253,"std":278},"min":140,"tableMax":375},"78":{"male":{"pp":293,"std":322},"female":{"pp":261,"std":287},"min":143,"tableMax":385},"79":{"male":{"pp":301,"std":331},"female":{"pp":268,"std":295},"min":147,"tableMax":394},"80":{"male":{"pp":308,"std":341},"female":{"pp":274,"std":308},"min":151,"tableMax":405},"81":{"male":{"pp":315,"std":349},"female":{"pp":282,"std":316},"min":154,"tableMax":415},"82":{"male":{"pp":325,"std":359},"female":{"pp":288,"std":326},"min":157,"tableMax":425},"83":{"male":{"pp":336,"std":369},"female":{"pp":293,"std":336},"min":160,"tableMax":427},"84":{"male":{"pp":345,"std":378},"female":{"pp":298,"std":345},"min":164,"tableMax":440}},"beyond":{"58":[[89,134],[135,155],[156,196],[197,205]],"59":[[92,139],[140,160],[161,203],[204,212]],"60":[[95,144],[145,166],[167,209],[210,220]],"61":[[98,149],[150,171],[172,216],[217,227]],"62":[[101,153],[154,177],[178,224],[225,235]],"63":[[104,158],[159,183],[184,231],[232,242]],"64":[[108,164],[165,188],[189,238],[239,250]],"65":[[111,169],[170,194],[195,246],[247,258]],"66":[[115,174],[175,200],[201,253],[254,266]],"67":[[118,179],[180,207],[208,261],[261,274]],"68":[[122,185],[186,213],[214,269],[270,282]],"69":[[125,190],[191,219],[220,277],[278,291]],"70":[[129,196],[197,225],[226,285],[286,299]],"71":[[133,201],[202,232],[233,293],[294,308]],"72":[[136,207],[208,239],[240,302],[301,317]],"73":[[140,213],[214,245],[246,310],[311,325]],"74":[[144,219],[220,252],[253,319],[320,334]],"75":[[148,225],[226,259],[260,327],[328,344]],"76":[[152,231],[232,266],[267,336],[337,353]],"77":[[156,237],[238,273],[274,345],[346,362]],"78":[[160,243],[244,280],[281,354],[355,372]],"79":[[164,249],[250,287],[288,363],[363,381]],"80":[[168,256],[257,295],[296,372],[373,391]],"81":[[173,262],[263,302],[303,382],[383,401]],"82":[[177,268],[269,309],[310,391],[392,411]],"83":[[181,275],[276,317],[318,401],[402,421]]},"corebridge":{"56":{"graded":[74,203],"level":[79,189]},"57":{"graded":[77,210],"level":[81,196]},"58":{"graded":[79,217],"level":[84,203]},"59":{"graded":[82,225],"level":[87,210]},"60":{"graded":[85,232],"level":[90,217]},"61":{"graded":[88,240],"level":[93,224]},"62":{"graded":[91,248],"level":[96,232]},"63":{"graded":[94,256],"level":[99,239]},"64":{"graded":[97,265],"level":[103,247]},"65":{"graded":[100,273],"level":[106,255]},"66":{"graded":[103,281],"level":[109,263]},"67":{"graded":[106,290],"level":[112,271]},"68":{"graded":[109,299],"level":[116,279]},"69":{"graded":[112,307],"level":[119,287]},"70":{"graded":[116,316],"level":[123,296]},"71":{"graded":[119,326],"level":[126,304]},"72":{"graded":[122,335],"level":[130,313]},"73":{"graded":[126,344],"level":[133,321]},"74":{"graded":[129,354],"level":[137,330]},"75":{"graded":[133,363],"level":[141,339]},"76":{"graded":[136,373],"level":[145,348]},"77":{"graded":[140,383],"level":[148,358]},"78":{"graded":[144,393],"level":[152,367]},"79":{"graded":[147,403],"level":[156,376]},"80":{"graded":[151,413],"level":[160,386]},"81":{"graded":[155,424],"level":[164,396]},"82":{"graded":[159,434],"level":[168,406]}}};
const VITAL_RULES = {
  "banner": {
    "bp": {
      "preferred_plus": {
        "sys": 135,
        "dia": 85
      },
      "preferred": {
        "sys": 140,
        "dia": 90
      },
      "standard_plus": {
        "sys": 145,
        "dia": 90
      },
      "standard": {
        "sys": 156,
        "dia": 94
      }
    },
    "cholesterol": {
      "totalMin": 120,
      "totalMax": 300,
      "ratio": {
        "preferred_plus": 4.5,
        "preferred": 5.5,
        "standard_plus": 6.5,
        "standard": 8
      }
    }
  },
  "foresters": {
    "bp": {
      "preferred_plus": [
        {
          "ageMin": 18,
          "ageMax": 59,
          "sys": 135,
          "dia": 85
        },
        {
          "ageMin": 60,
          "ageMax": 69,
          "sys": 145,
          "dia": 85
        },
        {
          "ageMin": 70,
          "ageMax": 200,
          "sys": 150,
          "dia": 90
        }
      ],
      "preferred": [
        {
          "ageMin": 18,
          "ageMax": 59,
          "sys": 140,
          "dia": 85
        },
        {
          "ageMin": 60,
          "ageMax": 69,
          "sys": 140,
          "dia": 90
        },
        {
          "ageMin": 70,
          "ageMax": 200,
          "sys": 155,
          "dia": 90
        }
      ],
      "standard_plus": [
        {
          "ageMin": 18,
          "ageMax": 59,
          "sys": 145,
          "dia": 90
        },
        {
          "ageMin": 60,
          "ageMax": 69,
          "sys": 150,
          "dia": 90
        },
        {
          "ageMin": 70,
          "ageMax": 200,
          "sys": 160,
          "dia": 90
        }
      ],
      "tobacco_plus": [
        {
          "ageMin": 18,
          "ageMax": 59,
          "sys": 145,
          "dia": 90
        },
        {
          "ageMin": 60,
          "ageMax": 69,
          "sys": 150,
          "dia": 90
        },
        {
          "ageMin": 70,
          "ageMax": 200,
          "sys": 155,
          "dia": 90
        }
      ]
    },
    "cholesterol": {
      "minUntreated": 130,
      "total": {
        "preferred_plus": [
          {
            "ageMin": 18,
            "ageMax": 60,
            "max": 230
          },
          {
            "ageMin": 61,
            "ageMax": 70,
            "max": 240
          },
          {
            "ageMin": 71,
            "ageMax": 200,
            "max": 250
          }
        ],
        "preferred": [
          {
            "ageMin": 18,
            "ageMax": 60,
            "max": 250
          },
          {
            "ageMin": 61,
            "ageMax": 70,
            "max": 280
          },
          {
            "ageMin": 71,
            "ageMax": 200,
            "max": 280
          }
        ],
        "standard_plus": [
          {
            "ageMin": 18,
            "ageMax": 60,
            "max": 300
          },
          {
            "ageMin": 61,
            "ageMax": 70,
            "max": 300
          },
          {
            "ageMin": 71,
            "ageMax": 200,
            "max": 300
          }
        ],
        "tobacco_plus": [
          {
            "ageMin": 18,
            "ageMax": 60,
            "max": 300
          },
          {
            "ageMin": 61,
            "ageMax": 70,
            "max": 300
          },
          {
            "ageMin": 71,
            "ageMax": 200,
            "max": 300
          }
        ]
      },
      "ratio": {
        "preferred_plus": [
          {
            "ageMin": 18,
            "ageMax": 60,
            "max": 5
          },
          {
            "ageMin": 61,
            "ageMax": 70,
            "max": 4.5
          },
          {
            "ageMin": 71,
            "ageMax": 200,
            "max": 4
          }
        ],
        "preferred": [
          {
            "ageMin": 18,
            "ageMax": 60,
            "max": 5.5
          },
          {
            "ageMin": 61,
            "ageMax": 70,
            "max": 6
          },
          {
            "ageMin": 71,
            "ageMax": 200,
            "max": 6.5
          }
        ],
        "standard_plus": [
          {
            "ageMin": 18,
            "ageMax": 60,
            "max": 6.5
          },
          {
            "ageMin": 61,
            "ageMax": 70,
            "max": 7
          },
          {
            "ageMin": 71,
            "ageMax": 200,
            "max": 7.5
          }
        ],
        "tobacco_plus": [
          {
            "ageMin": 18,
            "ageMax": 60,
            "max": 6.5
          },
          {
            "ageMin": 61,
            "ageMax": 70,
            "max": 7
          },
          {
            "ageMin": 71,
            "ageMax": 200,
            "max": 7.5
          }
        ]
      }
    }
  },
  "transamerica": {
    "bp": {
      "preferred_plus": [
        {
          "ageMin": 0,
          "ageMax": 70,
          "sys": 135,
          "dia": 85
        },
        {
          "ageMin": 71,
          "ageMax": 200,
          "sys": 145,
          "dia": 85
        }
      ],
      "preferred": [
        {
          "ageMin": 0,
          "ageMax": 70,
          "sys": 145,
          "dia": 85
        },
        {
          "ageMin": 71,
          "ageMax": 200,
          "sys": 150,
          "dia": 90
        }
      ],
      "standard_plus": [
        {
          "ageMin": 0,
          "ageMax": 70,
          "sys": 148,
          "dia": 88
        },
        {
          "ageMin": 71,
          "ageMax": 200,
          "sys": 152,
          "dia": 88
        }
      ],
      "standard": null
    },
    "cholesterol": {
      "total": {
        "preferred_plus": 230,
        "preferred": 260,
        "standard_plus": 300
      },
      "ratio": {
        "preferred_plus": [
          {
            "ageMin": 0,
            "ageMax": 70,
            "max": 5
          },
          {
            "ageMin": 71,
            "ageMax": 200,
            "max": 5.5
          }
        ],
        "preferred": [
          {
            "ageMin": 0,
            "ageMax": 70,
            "max": 5.5
          },
          {
            "ageMin": 71,
            "ageMax": 200,
            "max": 6
          }
        ],
        "standard_plus": [
          {
            "ageMin": 0,
            "ageMax": 70,
            "max": 6.2
          },
          {
            "ageMin": 71,
            "ageMax": 200,
            "max": 6.7
          }
        ],
        "standard": [
          {
            "ageMin": 0,
            "ageMax": 70,
            "max": 7
          },
          {
            "ageMin": 71,
            "ageMax": 200,
            "max": 7.5
          }
        ]
      },
      "note": "Total cholesterol criteria are published for preferred classes; Standard Nonsmoker has no published cholesterol ceiling. Ratio ceilings: Standard 7.0 (\u226470) / 7.5 (71+)."
    }
  },
  "mutual_of_omaha": {
    "bp": {
      "preferred_plus": {
        "sys": 140,
        "dia": 85
      },
      "preferred": {
        "sys": 145,
        "dia": 90
      },
      "standard_plus": {
        "sys": 150,
        "dia": 90
      }
    },
    "cholesterol": {
      "totalMax": 300,
      "ratio": {
        "preferred_plus": 5,
        "preferred": 6,
        "standard_plus": 7
      },
      "strict": true
    }
  },
  "fg_quantum": {
    "bp": {
      "preferred": [
        {
          "ageMin": 18,
          "ageMax": 50,
          "sys": 150,
          "dia": 90
        },
        {
          "ageMin": 51,
          "ageMax": 60,
          "sys": 160,
          "dia": 95
        }
      ],
      "standard_plus": null,
      "standard": [
        {
          "ageMin": 18,
          "ageMax": 50,
          "sys": 155,
          "dia": 95
        },
        {
          "ageMin": 51,
          "ageMax": 60,
          "sys": 160,
          "dia": 95
        }
      ]
    },
    "cholesterol": {
      "total": {
        "standard": [
          {
            "ageMin": 18,
            "ageMax": 60,
            "max": 300
          }
        ],
        "preferred": [
          {
            "ageMin": 18,
            "ageMax": 50,
            "max": 260
          },
          {
            "ageMin": 51,
            "ageMax": 60,
            "max": 280
          }
        ]
      },
      "ratio": {
        "standard": [
          {
            "ageMin": 18,
            "ageMax": 60,
            "max": 8
          }
        ],
        "preferred": [
          {
            "ageMin": 18,
            "ageMax": 60,
            "max": 7
          }
        ]
      },
      "note": "Cholesterol treatment accepted as long as the current and historical levels averaged over the last two years meet the parameter. Preferred: total 260 (18-50) / 280 (51-60), ratio 7; Standard: total 300 or less, ratio 8."
    }
  }
};
const PRODUCT_RULES = Object.fromEntries([
  {
    "id": "banner_opterm",
    "carrier": "Banner Life",
    "name": "OPTerm",
    "kind": "term",
    "route": "Fully underwritten",
    "sources": [
      "B-FIELD",
      "B-SPECS"
    ],
    "status": "criteria",
    "reviewed": "2026-10-08",
    "minAge": 20,
    "maxAge": 75,
    "minFace": 100000,
    "terms": {
      "10": [
        75,
        75
      ],
      "15": [
        75,
        75
      ],
      "20": [
        70,
        65
      ],
      "25": [
        60,
        55
      ],
      "30": [
        55,
        50
      ],
      "35": [
        50,
        45
      ],
      "40": [
        45,
        40
      ]
    },
    "family": "banner",
    "build": "banner",
    "vitals": "banner",
    "nicotine": [
      36,
      24,
      12,
      12
    ],
    "ageBasis": "nearest",
    "excludeStates": [
      "NY"
    ]
  },
  {
    "id": "banner_beyondterm",
    "carrier": "Banner Life",
    "name": "BeyondTerm",
    "kind": "term",
    "route": "Digital simplified",
    "sources": [
      "D077",
      "D084"
    ],
    "status": "partial",
    "reviewed": "2026-10-09",
    "minAge": 20,
    "maxAge": 65,
    "minFace": 100000,
    "faceBands": [
      [
        50,
        2000000
      ],
      [
        60,
        500000
      ],
      [
        65,
        250000
      ]
    ],
    "terms": {
      "10": [
        65,
        65
      ],
      "15": [
        60,
        60
      ],
      "20": [
        60,
        60
      ],
      "25": [
        55,
        55
      ],
      "30": [
        50,
        50
      ],
      "35": [
        45,
        45
      ],
      "40": [
        40,
        40
      ]
    },
    "build": "beyond",
    "excludeStates": [
      "NY"
    ],
    "nicotineUnconfirmed": true,
    "termTobaccoIndependent": true,
    "scopeNote": "BeyondTerm uses its own published product limits and build chart. The Flex-only medical/criminal exclusions are not automatically applied to BeyondTerm. Its complete application, tobacco definitions and class-rating rules remain unconfirmed; no final class or benefit tier is assigned."
  },
  {
    "id": "banner_flex",
    "carrier": "Banner Life",
    "name": "BeyondTermflex",
    "kind": "term",
    "route": "Digital simplified with risk levels",
    "sources": [
      "D077",
      "D085",
      "BF-INFO"
    ],
    "status": "partial",
    "reviewed": "2026-10-09",
    "minAge": 20,
    "maxAge": 65,
    "minFace": 25000,
    "build": "flex",
    "excludeStates": [
      "NY"
    ],
    "eligibilitySource": "BF-INFO",
    "faceBands": [
      [
        44,
        500000
      ],
      [
        54,
        250000
      ],
      [
        65,
        100000
      ]
    ],
    "level23FaceBands": [
      [
        44,
        250000
      ],
      [
        54,
        100000
      ],
      [
        65,
        50000
      ]
    ],
    "terms": {
      "10": [
        65,
        65
      ],
      "15": [
        60,
        60
      ],
      "20": [
        60,
        60
      ],
      "25": [
        55,
        55
      ]
    },
    "termTobaccoIndependent": true,
    "scopeNote": "BeyondTermflex screens only the published outer limits: ages 20\u201365, $25,000 minimum, maximum $500,000 at ages 20\u201344, $250,000 at 45\u201354 and $100,000 at 55\u201365. Level 2/3 maxima are $250,000, $100,000 and $50,000 respectively. Offered terms are 10 years through age 65, 15 years through 60, 20 years through 60 for Level 1 (55 for Level 2/3), and 25 years through 55 for Level 1 only. The carrier age basis and actual risk level must be confirmed; a BMI build level does not establish the policy level. Being within the outer limits does not confirm eligibility, a health class, rates or a benefit tier. Selected explicit Flex medical and criminal exclusions are screened separately. Conflicting or qualitative guide statements require review; tobacco definitions and final class/level decisions remain unconfirmed.",
    "nicotineUnconfirmed": true
  },
  {
    "id": "foresters_yourterm_med",
    "carrier": "Foresters",
    "name": "Your Term",
    "kind": "term",
    "route": "Fully underwritten",
    "sources": [
      "D152",
      "D199",
      "D235"
    ],
    "status": "criteria",
    "reviewed": "2026-10-08",
    "minAge": 18,
    "maxAge": 80,
    "minFace": 100000,
    "terms": {
      "10": [
        80,
        80
      ],
      "15": [
        70,
        70
      ],
      "20": [
        65,
        60
      ],
      "25": [
        60,
        55
      ],
      "30": [
        55,
        50
      ]
    },
    "family": "foresters",
    "build": "foresters",
    "vitals": "foresters",
    "nicotine": [
      60,
      36,
      12,
      12
    ],
    "ageBasis": "nearest",
    "drivingPPMax": 1
  },
  {
    "id": "foresters_advantage_med",
    "carrier": "Foresters",
    "name": "Advantage Plus II",
    "kind": "whole_life",
    "route": "Fully underwritten",
    "sources": [
      "D152",
      "D199",
      "D183"
    ],
    "status": "criteria",
    "reviewed": "2026-10-08",
    "minAge": 18,
    "maxAge": 85,
    "minFace": 25000,
    "preferredMinFace": 100000,
    "family": "foresters",
    "build": "foresters",
    "vitals": "foresters",
    "nicotine": [
      60,
      36,
      12,
      12
    ],
    "ageBasis": "nearest",
    "drivingPPMax": 2
  },
  {
  "id": "foresters_smart_med",
    "carrier": "Foresters",
    "name": "SMART UL",
    "kind": "universal_life",
    "route": "Fully underwritten",
    "sources": [
      "D152",
      "D199",
      "F-SMART-SPECS"
    ],
    "status": "partial",
    "reviewed": "2026-10-10",
    "family": "foresters",
    "build": "foresters",
    "vitals": "foresters",
    "nicotine": [
      60,
      36,
      12,
      12
    ],
    "ageBasis": "nearest",
    "drivingPPMax": 2,
    "minAge": 0,
    "maxAge": 85,
    "minFaceBands": [
      [
        15,
        50000
      ],
      [
        70,
        100000
      ],
      [
        75,
        50000
      ],
      [
        85,
        25000
      ]
    ],
    "eligibilitySource": "F-SMART-SPECS",
    "eligibilityPages": [
      3
    ],
    "scopeNote": "This is the SMART UL medical route, not its non-medical route. The supplied/currently linked product guide uses age nearest birthday and medical minimums of $50,000 at 0\u201315, $100,000 at 16\u201370, $50,000 at 71\u201375 and $25,000 at 76\u201385. Adult class estimates are withheld for juveniles. At 71\u201385, the favorable classes require at least $100,000. The complete current application, class restrictions and state approval remain under review; no final class is assigned."
  },
  {
    "id": "foresters_yourterm_nonmed",
    "carrier": "Foresters",
    "name": "Your Term",
    "kind": "term",
    "route": "Non-medical",
    "sources": [
      "D152",
      "D199",
      "D235"
    ],
    "status": "partial",
    "reviewed": "2026-10-08",
    "minFace": 50000,
    "terms": {
      "10": [
        80,
        80
      ],
      "15": [
        70,
        70
      ],
      "20": [
        65,
        60
      ],
      "25": [
        60,
        55
      ],
      "30": [
        55,
        45
      ]
    },
    "minAge": 18,
    "maxAge": 80,
    "ageBasis": "nearest",
    "faceBands": [
      [
        55,
        400000
      ],
      [
        80,
        150000
      ]
    ]
  },
  {
  "id": "foresters_strong",
    "carrier": "Foresters",
    "name": "Strong Foundation",
    "kind": "term",
    "route": "Non-medical",
    "sources": [
      "D152",
      "D199",
      "F-SF-SPECS"
    ],
    "status": "partial",
    "reviewed": "2026-10-10",
    "minAge": 18,
    "maxAge": 80,
    "ageBasis": "nearest",
    "faceBands": [
      [
        55,
        500000
      ],
      [
        80,
        250000
      ]
    ],
    "minFace": 50000,
    "terms": {
      "10": [
        80,
        80
      ],
      "15": [
        70,
        70
      ],
      "20": [
        65,
        60
      ],
      "25": [
        55,
        55
      ],
      "30": [
        50,
        50
      ]
    },
    "maleTobaccoTermCaps": {
      "25": 50,
      "30": 45
    },
    "eligibilitySource": "F-SF-SPECS",
    "eligibilityPages": [
      3
    ],
    "maxFaceSource": "D152",
    "maxFacePages": [
      7
    ],
    "substandardFaceBands": [
      [
        55,
        300000
      ],
      [
        80,
        150000
      ]
    ],
    "scopeNote": "Strong Foundation screens its own term ages, including the lower male-tobacco ages for 25/30-year terms, and its $50,000 minimum. The April 2026 underwriting guide resolves the older product table overlap at age 55: the lower non-medical coverage band starts at 56. Existing Foresters coverage counts toward the limit. Amounts above the substandard band require confirmation of the carrier-assigned class; the amount never selects a class. Complete application, diabetes rating, medical combinations and state approval still require carrier review."
  },
  {
    "id": "moo_full",
    "carrier": "Mutual of Omaha",
    "name": "Fully underwritten life (base coverage)",
    "kind": "life",
    "route": "Fully underwritten",
    "sources": [
      "D282"
    ],
    "status": "criteria",
    "reviewed": "2026-10-08",
    "family": "moo",
    "build": "mutual_of_omaha",
    "vitals": "mutual_of_omaha",
    "nicotine": [
      36,
      24,
      12,
      12
    ],
    "ageBasis": "last",
    "scopeNote": "Base health criteria only. Confirm exact term/permanent plan, issue ages, term length, state and riders with the carrier."
  },
  {
  "id": "moo_tle",
    "carrier": "Mutual of Omaha",
    "name": "Term Life Express",
    "kind": "term",
    "route": "Simplified issue",
    "sources": [
      "D295",
      "D299"
    ],
    "status": "partial",
    "reviewed": "2026-10-10",
    "minAge": 18,
    "maxAge": 75,
    "ageBasis": "last",
    "faceBands": [
      [
        50,
        550000
      ],
      [
        60,
        450000
      ],
      [
        75,
        350000
      ]
    ],
    "minFace": 25000,
    "availableTerms": [
      10,
      15,
      20,
      30
    ],
    "eligibilitySource": "D299",
    "eligibilityPages": [
      2
    ],
    "scopeNote": "The April 2026 brochure supports a $25,000 minimum, age-dependent face limits and 10/15/20/30-year terms. It does not establish every term-specific issue-age or class rule. Confirm the current application, selected term at the issue age, medical combinations and state variations with Mutual of Omaha; a permitted duration does not establish eligibility."
  },
  {
  "id": "moo_iule",
    "carrier": "Mutual of Omaha",
    "name": "IUL Express",
    "kind": "universal_life",
    "route": "Simplified issue",
    "sources": [
      "D295",
      "D286"
    ],
    "status": "partial",
    "reviewed": "2026-10-10",
    "minAge": 18,
    "maxAge": 75,
    "ageBasis": "last",
    "minFace": 25000,
    "faceBands": [
      [
        50,
        550000
      ],
      [
        60,
        450000
      ],
      [
        75,
        350000
      ]
    ],
    "eligibilitySource": "D286",
    "eligibilityPages": [
      7
    ],
    "scopeNote": "The April 2026 IUL Express product guide supports age last birthday, issue ages 18\u201375 and $25,000 minimum coverage, with maximums of $550,000 through age 50, $450,000 at 51\u201360 and $350,000 at 61\u201375. This permanent product has no selected term duration. Current application/class criteria, medical combinations, illustration and state variations remain under review."
  },
  {
    "id": "fg_quantum",
    "carrier": "F&G",
    "name": "Quantum",
    "kind": "universal_life",
    "route": "Application and database underwriting",
    "sources": [
      "D141"
    ],
    "status": "criteria",
    "reviewed": "2026-10-08",
    "family": "fg",
    "build": "fg_quantum",
    "vitals": "fg_quantum",
    "nicotine": [
      24,
      24,
      12,
      12
    ],
    "minAge": 0,
    "maxAge": 60,
    "minFace": 50000,
    "maxFace": 1000000,
    "ageBasis": "unconfirmed",
    "excludeTerritories": true,
    "classes": [
      "preferred",
      "standard"
    ]
  },
  {
  "id": "fg_pathsetter",
    "carrier": "F&G",
    "name": "Pathsetter",
    "kind": "universal_life",
    "route": "Fully underwritten",
    "sources": [
      "D121",
      "FG-PS-SPECS"
    ],
    "status": "partial",
    "reviewed": "2026-10-10",
    "minAge": 0,
    "maxAge": 80,
    "minFace": 50000,
    "eligibilitySource": "FG-PS-SPECS",
    "eligibilityPages": [
      1
    ],
    "excludeStates": [
      "NY"
    ],
    "stateSource": "FG-PS-SPECS",
    "statePages": [
      7
    ],
    "scopeNote": "The current March 2026 Pathsetter sheet supports ages 0\u201380 and a $50,000 minimum face amount. Its $500,000 maximum premium is not a maximum death benefit. Exam-free program limits do not establish the fully underwritten route maximum. The older general underwriting guide is retained as dated evidence only; age basis, current application, complete class criteria and state approval remain unresolved."
  },
  {
    "id": "transamerica_super",
    "carrier": "Transamerica",
    "name": "Trendsetter Super",
    "kind": "term",
    "route": "Fully underwritten",
    "sources": [
      "D370",
      "D398"
    ],
    "status": "criteria",
    "reviewed": "2026-10-08",
    "minAge": 18,
    "maxAge": 80,
    "minFace": 25000,
    "preferredMinFace": 100000,
    "terms": {
      "10": [
        80,
        80
      ],
      "15": [
        78,
        73
      ],
      "20": [
        70,
        65
      ],
      "25": [
        65,
        60
      ],
      "30": [
        58,
        53
      ]
    },
    "family": "transamerica",
    "build": "bmi",
    "vitals": "transamerica",
    "nicotine": [
      60,
      24,
      24,
      24
    ],
    "ageBasis": "last",
    "scopeNote": "Base policy only. Term length, state availability and riders require carrier confirmation."
  },
  {
    "id": "corebridge_legacy",
    "carrier": "Corebridge / American General",
    "name": "SimpliNow Legacy",
    "kind": "final_expense",
    "route": "Simplified issue whole life",
    "sources": [
      "D106",
      "D105"
    ],
    "status": "criteria",
    "reviewed": "2026-10-08",
    "build": "corebridge",
    "minFace": 5000,
    "maxFace": 35000,
    "minAge": 50,
    "maxAge": 80,
    "excludeStates": [
      "NY"
    ],
    "ageBasis": "last",
    "scopeNote": "Benefit tier screening only. Confirm face limits and the current state-specific application before quoting."
  },
  {
    "id": "amam_qsfp",
    "carrier": "American Amicable",
    "name": "Quility Secure Future Preferred",
    "kind": "final_expense",
    "route": "Instant-decision simplified issue whole life",
    "sources": ["AM-QSFP-INFO", "AM-QSFP-FAQ", "D016", "D017"],
    "status": "partial",
    "reviewed": "2026-10-09",
    "eligibilitySource": "AM-QSFP-INFO",
    "minAge": 50,
    "maxAge": 85,
    "maxFace": 100000,
    "excludeStates": ["NY"],
    "scopeNote": "QSFP is final-expense whole life, with permanent coverage rather than a selected term. The July 2026 product sheet lists a $5,000 minimum and the October 2026 FAQ lists $2,500; requests in that difference require current carrier confirmation. Standard/Preferred/Preferred Plus limits depend on the carrier's actual class, which this partial profile does not assign. Current application, age basis, rating criteria, state approvals and appointment remain unconfirmed."
  },
  {
    "id": "sbli_easytrak",
    "carrier": "SBLI",
    "name": "EasyTrak Digital Term",
    "kind": "term",
    "route": "Simplified issue",
    "sources": [
      "D347",
      "SB-ET-SPECS",
      "SB-ET-GUIDE",
      "SB-ET-FAQ"
    ],
    "status": "partial",
    "reviewed": "2026-10-09",
    "minAge": 18,
    "maxAge": 60,
    "minFace": 100000,
    "maxFace": 1000000,
    "faceBands": [
      [
        40,
        1000000
      ],
      [
        50,
        1000000
      ],
      [
        55,
        500000
      ],
      [
        60,
        150000
      ]
    ],
    "terms": {
      "10": [
        60,
        60
      ],
      "15": [
        60,
        60
      ],
      "20": [
        60,
        60
      ],
      "30": [
        50,
        50
      ]
    },
    "termTobaccoIndependent": true,
    "eligibilitySource": "SB-ET-SPECS",
    "stateSource": "SB-ET-FAQ",
    "statePages": [],
    "excludeStates": [
      "NY"
    ],
    "ageBasis": "nearest",
    "scopeNote": "Published face, term and financial screens are recorded. Income definitions, replacement-edition differences, complete class criteria and current application/state approvals still require SBLI review."
  },
  {
    "id": "royal",
    "carrier": "Royal Neighbors",
    "name": "Fully underwritten life",
    "kind": "life",
    "route": "Fully underwritten",
    "sources": [
      "D309"
    ],
    "status": "partial",
    "reviewed": "2026-10-08"
  },
  {
  "id": "uhl_simple20",
    "carrier": "United Home Life",
    "name": "Simple Term 20 DLX",
    "kind": "term",
    "route": "Simplified issue \u2014 Texas application",
    "sources": [
      "D459",
      "D404",
      "UHL-PORTFOLIO"
    ],
    "status": "partial",
    "reviewed": "2026-10-10",
    "onlyStates": [
      "TX"
    ],
    "minAge": 20,
    "maxAge": 60,
    "minFace": 25000,
    "maxFace": 50000,
    "terms": {
      "20": [
        60,
        60
      ]
    },
    "termTobaccoIndependent": true,
    "ageBasis": "last",
    "eligibilitySource": "UHL-PORTFOLIO",
    "eligibilityPages": [
      1
    ],
    "stateSource": "D459",
    "statePages": [
      1,
      5,
      7
    ],
    "limitStates": [
      "TX"
    ],
    "scopeNote": "The current March 2026 product portfolio supports Simple Term 20 DLX at age last birthday 20\u201360, $25,000\u2013$50,000 and a 20-year term. This profile is scoped to the supplied Texas application; other states require their own application/variations. The built-in table is a product design, not an individualized health-class estimate. Current application edition, complete medical combinations and state-specific carrier decisions remain under review."
  },
  {
  "id": "uhl_otherterm",
    "carrier": "United Home Life",
    "name": "Simple Term 20 / 30 / 20 ROP \u2014 Texas",
    "kind": "term",
    "route": "Simplified issue \u2014 Texas application",
    "sources": [
      "D459",
      "D404",
      "UHL-PORTFOLIO"
    ],
    "status": "partial",
    "reviewed": "2026-10-10",
    "onlyStates": [
      "TX"
    ],
    "minAge": 20,
    "maxAge": 60,
    "minFace": 25000,
    "faceBands": [
      [
        45,
        500000
      ],
      [
        55,
        375000
      ],
      [
        60,
        250000
      ]
    ],
    "availableTerms": [
      20,
      30
    ],
    "ageBasis": "last",
    "eligibilitySource": "UHL-PORTFOLIO",
    "eligibilityPages": [
      1
    ],
    "stateSource": "D459",
    "statePages": [
      1,
      5,
      7
    ],
    "limitStates": [
      "TX"
    ],
    "scopeNote": "Choose the exact Simple Term 20, Simple Term 30 or Simple Term 20 ROP plan. The March 2026 portfolio supplies separate age, tobacco, duration and coverage limits; old saved drafts do not imply a plan choice. Screens use age last birthday and are scoped to Texas. ROP coverage bands do not assign a medical class or calculate a premium. The current application edition, complete medical combinations and carrier decisions remain under review."
  },
  {
    "id": "national_life",
    "carrier": "National Life",
    "name": "Term \u2014 exact product and issuing company needed",
    "kind": "term",
    "route": "Unverified",
    "sources": [
      "NLG-PRODUCT"
    ],
    "status": "unverified",
    "reviewed": "2026-10-09",
    "scopeNote": "The National Life Group overview describes term life insurance but does not identify the exact plan, issuing company, application or product-specific underwriting criteria for this selection. Obtain those current materials before applying age, amount, term or health-class rules. This overview is an identity reference, not underwriting evidence."
  },
  {
    "id": "john_hancock",
    "carrier": "John Hancock",
    "name": "Simple Term with Vitality \u2014 underwriting source pending",
    "kind": "term",
    "route": "Unverified",
    "sources": [
      "JH-PRODUCT"
    ],
    "status": "unverified",
    "reviewed": "2026-10-09",
    "scopeNote": "John Hancock\u2019s current Vitality overview references Simple Term with Vitality, but does not supply its eligibility or medical underwriting rules. The indexed April 2023 Simple Term guide was not available at its official URL when checked. A current product-specific application and underwriting guide are needed. General John Hancock term or fully underwritten rules are not substituted; no conclusion about discontinuation is drawn."
  },
  {
    "id": "quility",
    "carrier": "Legal & General America",
    "name": "Quility Term Plus \u2014 legacy name; confirm BeyondTerm",
    "kind": "term",
    "route": "Legacy product identity \u2014 carrier review",
    "sources": [
      "QTP-RENAME",
      "QTP-LEGACY"
    ],
    "status": "unverified",
    "reviewed": "2026-10-09",
    "scopeNote": "Quility support identifies BeyondTerm as the product previously known as LGA Quility Term Plus (QTP). This saved legacy selection is retained for review and is not automatically converted to the separate BeyondTerm profile. Reconfirm the current application, product, state and underwriting route before selecting BeyondTerm. The 2024 QTP guide establishes historical identity; its medical rating rules are not applied to current BeyondTerm."
  },
  {
    "id": "americo",
    "carrier": "Americo",
    "name": "Eagle Select \u2014 benefit tier requires carrier review",
    "kind": "final_expense",
    "route": "Instant-decision simplified issue",
    "sources": [
      "AM-ES-SPECS",
      "AM-ES-GUIDE"
    ],
    "status": "partial",
    "reviewed": "2026-10-09",
    "ageBasis": "last",
    "build": "americo",
    "minAge": 40,
    "maxAge": 85,
    "minFace": 5000,
    "maxFace": 50000,
    "faceBands": [
      [
        75,
        50000
      ],
      [
        85,
        40000
      ]
    ],
    "excludeStates": [
      "NY"
    ],
    "scopeNote": "Eagle Select screens the published family age/coverage limits and selected January 2026 medical exclusions. Its build chart is recorded without a class or tier offer; out-of-chart or uncertain measurements require review. Initial nicotine classification uses at least 24 nicotine-free months. Quit Smoking Advantage is a separate post-issue program and does not make a nicotine policy non-nicotine. The carrier uses its current application and third-party evidence to select Eagle Select 1/2/3 or decline; initial medical questions are not blanket knock-outs. Eagle Select 3 ends at age 75/$25,000, and Eagle Select 2 nicotine issue ages end at 75. Pending-care wording, state-specific terms, complete medical combinations and actual benefit/tier decisions still require carrier review."
  }
].map(p => [p.id,p]));
const CLASS_ORDER = ["preferred_plus","preferred","standard_plus","standard","table"];
const CLASS_LABELS = {preferred_plus:"Preferred Plus",preferred:"Preferred",standard_plus:"Standard Plus",standard:"Standard",table:"Substandard"};
function freezeRules(value) { Object.values(value).forEach(v => { if (v && typeof v === "object") freezeRules(v); }); return Object.freeze(value); }
[PRODUCT_RULES, RULE_SOURCES, BUILD_CHARTS, VITAL_RULES, CLASS_ORDER, CLASS_LABELS].forEach(freezeRules);

