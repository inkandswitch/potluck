(() => {
  const day = 24 * 60 * 60 * 1000

  const date1 = new Date(Date.now() - (7 * day))
  const date2 = new Date(Date.now() - (4 * day))
  const date3 = new Date(Date.now() - (4 * day))
  const date4 = new Date(Date.now() - (4 * day))

  function dateToString (date) {
    return `${(date.getMonth() + 1)}/${date.getDate()}/${date.getFullYear()}`
  }

  return {
    "textDocument": {
      "id": "plant-watering",
      "name": "Plant Watering Tracker",
      "text": [
        "## Plants",
        "",
        "🌱 Fiddle leaf: every 6 days, last watered on " + dateToString(date1),
        "🌱 Montsera: every 4 days, last watered on " + dateToString(date2),
        "🌱 Yuzu tree: every 5 days, last watered on " + dateToString(date3),
        "- The Yuzu tree needs some holes in the pot so that water can drain.",
        "🌱 Pine Bonsai: every 4 days, last watered on " + dateToString(date4)
      ],
      "sheets": [
        {
          "id": "_j3k9Ygb6rLwbSyd5vinuv",
          "configId": "plant-watering.2",
          "hideHighlightsInDocument": false
        },
        {
          "id": "_a8dvDDZ1nZurQsdKLnzjR",
          "configId": "plant-watering.1",
          "hideHighlightsInDocument": false
        },
        {
          "id": "_FcKOW7acW3QAUd18PMGAt",
          "configId": "markdown",
          "hideHighlightsInDocument": true
        }
      ]
    },
    "sheetConfigs": [
      {
        "id": "plant-watering.2",
        "name": "schedule",
        "properties": [
          {
            "name": "$",
            "formula": "{dates:lastWatered}",
            "visibility": "HIDDEN"
          },
          {
            "name": "daysSince",
            "formula": "Round((Date.now() - Date.parse(lastWatered)) / (24 * 60 * 60 * 1000), 1)",
            "visibility": "HIDDEN"
          },
          {
            "name": "needsWater",
            "formula": "daysSince > PrevOfType($, \"interval\").data.intervalInt",
            "visibility": "HIDDEN"
          },
          {
            "name": "color",
            "formula": "needsWater ? \"red\": \"green\"",
            "visibility": "STYLE"
          },
          {
            "name": "button",
            "formula": "TemplateButton($, \"🚿\", DateTime.now().toLocaleString(), \"replace\")",
            "visibility": "INLINE"
          }
        ]
      },
      {
        "id": "plant-watering.1",
        "name": "interval",
        "properties": [
          {
            "name": "$",
            "formula": "every {number:interval} days",
            "visibility": "HIDDEN"
          },
          {
            "name": "intervalInt",
            "formula": "ParseInt(interval)",
            "visibility": "HIDDEN"
          },
          {
            "name": "daysSince",
            "formula": "Round((Date.now() - Date.parse(dates)) / (24 * 60 * 60 * 1000), 1)",
            "visibility": "HIDDEN"
          },
          {
            "name": "needsWater",
            "formula": "daysSince > intervalInt",
            "visibility": "HIDDEN"
          }
        ]
      },
      {
        "id": "markdown",
        "name": "markdown",
        "properties": [
          {
            "name": "$",
            "formula": "=Markdown()",
            "visibility": "HIDDEN"
          },
          {
            "name": "type",
            "formula": "$.data.type",
            "visibility": "HIDDEN"
          },
          {
            "name": "font-weight",
            "formula": "type.startsWith(\"h\") || type === \"bold\" ? \"bold\" : \"normal\"",
            "visibility": "STYLE"
          },
          {
            "name": "font-style",
            "formula": "type === \"italic\" ? \"italic\" : \"normal\"",
            "visibility": "STYLE"
          },
          {
            "name": "font-size",
            "formula": "({\"h1\": \"1.3rem\",\n  \"h2\": \"1rem\"}[type]) || \"normal\"",
            "visibility": "STYLE"
          }
        ]
      }
    ]
  }
})()