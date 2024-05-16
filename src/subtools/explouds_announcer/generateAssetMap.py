import json
import os

assetMap = {x: sorted([a for a in os.listdir(os.path.join('assets', x)) if a.endswith(".mp3")]) for x in next(os.walk("assets"))[1]}
assetMap["moves"] = [x.replace(".mp3", "") for x in assetMap["moves"]]
assetMap["pokemon"] = [x.replace(".mp3", "") for x in assetMap["pokemon"]]

with open("assets/assetMap.json", 'w') as f:
    json.dump(assetMap, f, indent=4, sort_keys=True)
    