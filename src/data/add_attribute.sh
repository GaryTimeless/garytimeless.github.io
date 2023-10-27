#!/bin/bash

FILE_PATH="./FitProducts.json"
ATTRIBUTE_NAME="id"

# Attribut mit fortlaufender Nummer hinzufügen und in die Datei schreiben
# jq --arg key "$ATTRIBUTE_NAME" 'to_entries | map(.value + {($key): (.key+1)})' $FILE_PATH > temp.json && mv temp.json $FILE_PATH
jq '
  map(
    if .vegan == "yes" then
      .veganstatus = "VeganStatus.YES" | del(.vegan)
    else
      .veganstatus = "VeganStatus.NO" | del(.vegan)
    end
  )
' $input_file > $output_file
