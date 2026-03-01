#!/usr/bin/env python3
"""Vault ID lookup — workers call this instead of having IDs in context.
Usage: python3 research/bianca-vault-lookup.py <content_key>
Example: python3 research/bianca-vault-lookup.py sexting1_vid_15
Returns: JSON with mediaFiles array and price"""
import json, sys

VAULT = {
    # FREE HOOKS
    "gfe_selfie_1": {"mediaFiles": ["4129214996"], "price": 0},
    "gfe_selfie_2": {"mediaFiles": ["4129214993"], "price": 0},
    "gfe_selfie_3": {"mediaFiles": ["4118094231"], "price": 0},
    "gfe_selfie_4": {"mediaFiles": ["4118094226"], "price": 0},
    "gfe_selfie_5": {"mediaFiles": ["4113019829"], "price": 0},
    "gfe_selfie_6": {"mediaFiles": ["4113019824"], "price": 0},
    "gfe_selfie_7": {"mediaFiles": ["4113019823"], "price": 0},
    "gfe_selfie_8": {"mediaFiles": ["4113019822"], "price": 0},
    "gfe_selfie_9": {"mediaFiles": ["4113019819"], "price": 0},
    "gfe_selfie_10": {"mediaFiles": ["4112955857"], "price": 0},
    "gfe_selfie_11": {"mediaFiles": ["4112955856"], "price": 0},
    "rekindle_vid_1": {"mediaFiles": ["4208184080"], "price": 0},
    "rekindle_vid_2": {"mediaFiles": ["4142976927"], "price": 0},
    "rekindle_vm": {"mediaFiles": ["4142976472"], "price": 0},

    # SEXTING 1 (natural/olive top)
    "sexting1_pic_free": {"mediaFiles": ["4084442782"], "price": 0},
    "sexting1_vid_15": {"mediaFiles": ["4084442804"], "price": 15},
    "sexting1_vid_24": {"mediaFiles": ["4084442810"], "price": 24},
    "sexting1_vid_38": {"mediaFiles": ["4084442819"], "price": 38},
    "sexting1_vid_54": {"mediaFiles": ["4084442829"], "price": 54},
    "sexting1_vid_75": {"mediaFiles": ["4084442833"], "price": 75},

    # SEXTING 2 (glasses/nerdy)
    "sexting2_pic_free": {"mediaFiles": ["4100912693"], "price": 0},
    "sexting2_vid_15": {"mediaFiles": ["4100912696"], "price": 15},
    "sexting2_vid_24": {"mediaFiles": ["4100912699"], "price": 24},
    "sexting2_vid_38": {"mediaFiles": ["4100912703"], "price": 38},
    "sexting2_vid_54": {"mediaFiles": ["4100912708"], "price": 54},
    "sexting2_vid_75": {"mediaFiles": ["4100912711"], "price": 75},

    # SEXTING 3 (purple/grey)
    "sexting3_pic_free": {"mediaFiles": ["4156205024"], "price": 0},
    "sexting3_vid_15": {"mediaFiles": ["4156205030"], "price": 15},
    "sexting3_vid_24": {"mediaFiles": ["4156205035"], "price": 24},
    "sexting3_vid_38": {"mediaFiles": ["4156205039"], "price": 38},
    "sexting3_vid_54": {"mediaFiles": ["4156205044"], "price": 54},
    "sexting3_vid_75": {"mediaFiles": ["4156205051"], "price": 75},
    "sexting3_vid_100": {"mediaFiles": ["4161281036"], "price": 100},

    # BUNDLES ($18 default)
    "bundle1_zebra_bra": {"mediaFiles": ["4095109757","4084340351","4084340350","4084340349","4084340348"], "price": 18, "count": 5},
    "bundle2_strip_tease": {"mediaFiles": ["4084508911","4084384391","4084340188","4084340187","4084340183","4084340182","4084340178","4084340177","4084340174","4084340168","4084340161"], "price": 18, "count": 11},
    "bundle3_handbra": {"mediaFiles": ["4095109759","4084340160","4084340156","4084340155","4084340152","4084340151","4084340143","4084340141","4084340138","4084340134","4084340132"], "price": 18, "count": 11},
    "bundle4_leopard_kini": {"mediaFiles": ["4095109760","4084339349","4084339348","4084339347","4084339346","4084339345"], "price": 18, "count": 6},
    "bundle5_blue_kini": {"mediaFiles": ["4095109765","4084352226","4084352221","4084352219","4084352217","4084352214","4084352208","4084352203","4084352179"], "price": 18, "count": 9},
    "bundle6_no_undie": {"mediaFiles": ["4090853530","4084384389","4084352202","4084352199","4084352183","4084352180"], "price": 18, "count": 6},
    "bundle7_brown_lingerie": {"mediaFiles": ["4095109773","4084339337","4084339336","4084339335","4084339334","4084339333","4084339331","4084339330","4084339325"], "price": 18, "count": 9},
    "bundle8_nude_bra": {"mediaFiles": ["4095109767","4084384387","4084339324","4084339323","4084339320","4084339319"], "price": 18, "count": 6},
    "bundle9_bed": {"mediaFiles": ["4163079923","4161285098","4161285094","4161285093","4161285090"], "price": 18, "count": 5},
    "bundle10_bts_shower": {"mediaFiles": ["4178636800","4161285101","4161285097","4161285092","4161285091"], "price": 18, "count": 5},
    "bundle11_red_bra": {"mediaFiles": ["4182101058","4176760767","4176760766","4176760765","4176760763","4176760761","4176760760","4176760759","4176760758","4176760757","4176760754","4176760753"], "price": 18, "count": 12},
    "bundle12_sheer_black": {"mediaFiles": ["4184130158","4176762659","4176762658","4176762655","4176762654","4176762653","4176762652","4176762650","4176762649","4176762647","4176762645","4176762644","4176762643","4176762641"], "price": 18, "count": 14},
    "bundle13_white_dress": {"mediaFiles": ["4187068301","4176764449","4176764448","4176764447","4176764444","4176764443","4176764442","4176764441","4176764440","4176764439","4176764438","4176764436"], "price": 18, "count": 12},
    "bundle14_dress_striptease": {"mediaFiles": ["4190352077","4161405222","4161405220","4161405218","4161405217","4161405215","4161405213","4161405212","4161405211","4161405210","4161405209","4161405206"], "price": 18, "count": 12},
    "bundle15_corset_striptease": {"mediaFiles": ["4190618896","4166315392","4161407774","4161407771","4161407769","4161407767","4161407765","4161407763","4161407760","4161407759","4161407758","4161407757","4161407756"], "price": 18, "count": 13},
    "bundle16_jacket_striptease": {"mediaFiles": ["4193745219","4166578144","4166578143","4166578142","4166578141","4166578140","4166578139","4166578138","4166578136","4166578135","4166578134","4166578131","4166578128","4166578127"], "price": 18, "count": 14},
    "bundle17_black_striptease": {"mediaFiles": ["4194216128","4166589335","4166589331","4166589329","4166589327","4166589326","4166589325","4166589324","4166589323","4166589322","4166589319"], "price": 18, "count": 11},
    "bundle18_flower_striptease": {"mediaFiles": ["4201723400","4177896625","4177896623","4177896621","4177896620","4177896618","4177896615","4177896613","4177896612","4177896610","4177896609","4177896608"], "price": 18, "count": 12},
    "bundle19_black_lingerie": {"mediaFiles": ["4166383225","4166383222","4166383220","4166383218","4166383215"], "price": 18, "count": 5},
    "bundle20_beige_bra": {"mediaFiles": ["4242088817","4242088813","4242088812","4242088811","4242088810","4242088808","4242088805","4242088802","4242088801","4242088796"], "price": 18, "count": 10},
    "bundle21_pink_floral": {"mediaFiles": ["4245488102","4245488099","4245488097","4245488096","4245488095","4245488093","4245488092","4245488091","4245488090","4245488089"], "price": 18, "count": 10},
    "bundle22_black_tease": {"mediaFiles": ["4245491586","4245491585","4245491583","4245491582","4245491580","4245491579","4245491577","4245491575","4245491574"], "price": 18, "count": 9},
    "bundle23_cherry_top": {"mediaFiles": ["4292078295","4250784656","4250784655","4250784654","4250784653","4250784649","4250784647","4250784646","4250784639"], "price": 18, "count": 9},
    "bundle24_black_floral": {"mediaFiles": ["4250791307","4250791305","4250791302","4250791301","4250791300","4250791298","4250791297","4250791294"], "price": 18, "count": 8},
    "bundle25_black_ribbon": {"mediaFiles": ["4251042040","4251042039","4251042037","4251042036","4251042035","4251042034","4251042032","4251042030","4251042029"], "price": 18, "count": 9},
    "bundle26_white_shirt": {"mediaFiles": ["4257179556","4257179555","4257179554","4257179550","4257179547","4257179546","4257179536","4257179535","4257179533","4257179524","4257179522","4257179520","4257179516"], "price": 18, "count": 13},

    # BODY CATEGORIES (free)
    "booty_pic": {"mediaFiles": ["4084340188"], "price": 0},
    "feet_pics": {"mediaFiles": ["4200837340","4200837337","4200837335","4200837333","4200837331","4200837329"], "price": 0, "count": 6},

    # BUMP PHOTOS (free)
    "bump_1": {"mediaFiles": ["4295115634"], "price": 0},
    "bump_2": {"mediaFiles": ["4295115608"], "price": 0},
    "bump_3": {"mediaFiles": ["4271207724"], "price": 0},
    "bump_4": {"mediaFiles": ["4128847737"], "price": 0},
    "bump_5": {"mediaFiles": ["4118094254"], "price": 0},
    "bump_6": {"mediaFiles": ["4118094218"], "price": 0},

    # CB PROMO SELFIES (free)
    "cb_promo_1": {"mediaFiles": ["4179154678"], "price": 0},
    "cb_promo_2": {"mediaFiles": ["4179154675"], "price": 0},
    "cb_promo_3": {"mediaFiles": ["4174667519"], "price": 0},

    # PREVIEW BUMPS (free)
    "preview_bump_1": {"mediaFiles": ["4141698164"], "price": 0},
    "preview_bump_2": {"mediaFiles": ["4141649812"], "price": 0},
    "preview_bump_3": {"mediaFiles": ["4141597798"], "price": 0},
    "preview_bump_4": {"mediaFiles": ["4141551599"], "price": 0},

    # CUSTOM UPSELL TIERS
    "custom_tier1_shower": {"mediaFiles": ["4242780548","4240412927","4132819366","4112437083","4109660005","4107908001","4106671990","4095915546","4095915531","4095915525","4095915510","4095915495","4095915490"], "price": 50, "count": 13},
    "custom_tier2_bedroom_boobs": {"mediaFiles": ["4242538532","4240412930","4141551599","4132819369","4107923734","4101091755"], "price": 60, "count": 6},
    "custom_tier3_bedroom_topless": {"mediaFiles": ["4241155807","4240495621","4125482011","4112437075","4108475260","4108475253","4108475241","4108475237"], "price": 70, "count": 8},
    "custom_tier4_topless_rubbing": {"mediaFiles": ["4244605437","4240495624","4138951601","4130805983","4130793373","4130787911","4130764880"], "price": 80, "count": 7},
    "custom_tier5_titty_fuck": {"mediaFiles": ["4240495622","4141597798","4116444565"], "price": 90, "count": 3},
    "custom_tier6_try_on": {"mediaFiles": ["4141649812","4132819370"], "price": 70, "count": 2},
    "custom_tier7_cumming_top": {"mediaFiles": ["4243623154","4240495623","4141698164","4139431932","4139422853","4139401380","4139381132","4139287517"], "price": 100, "count": 8},
}

if len(sys.argv) < 2:
    print("Usage: python3 bianca-vault-lookup.py <content_key>")
    print("Keys:", ", ".join(sorted(VAULT.keys())))
    sys.exit(1)

key = sys.argv[1]
if key == "list":
    for k, v in sorted(VAULT.items()):
        count = v.get("count", len(v["mediaFiles"]))
        print(f"  {k}: ${v['price']}, {count} items")
elif key in VAULT:
    print(json.dumps(VAULT[key]))
else:
    print(f"ERROR: Unknown key '{key}'. Use 'list' to see all keys.")
    sys.exit(1)
