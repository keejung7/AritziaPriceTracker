const fs = require("fs");
const path = require("path");

const inputPath = path.join(__dirname, "product_details.jsonl");
const outputPath = path.join(__dirname, "view.html");

(async () => {
  try {
    if (!fs.existsSync(inputPath)) {
      console.error(`Input file not found: ${inputPath}`);
      return;
    }

    const fileStream = fs.readFileSync(inputPath, "utf-8");
    const lines = fileStream.split("\n").filter((line) => line.trim() !== "");

    const tableData = [];

    for (const line of lines) {
      try {
        const product = JSON.parse(line);
        const link = product.product_link;

        if (product.colors && Array.isArray(product.colors)) {
          product.colors.forEach((colorObj) => {
            // colorObj structure is { "colorCode": { ...details } }
            const colorCode = Object.keys(colorObj)[0];
            const details = colorObj[colorCode];

            tableData.push({
              link: link,
              color_code: colorCode,
              color_name: details.color_text,
              original_price: details.original_price,
              sale_price: details.sale_price,
              sale_percent: details.sale_percent, // Keep as number for sorting
            });
          });
        }
      } catch (e) {
        console.error("Error parsing line:", e);
      }
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Aritzia Product Data</title>
    <link href="https://unpkg.com/tabulator-tables@5.5.4/dist/css/tabulator.min.css" rel="stylesheet">
    <script type="text/javascript" src="https://unpkg.com/tabulator-tables@5.5.4/dist/js/tabulator.min.js"></script>
    <style>
        body { font-family: sans-serif; padding: 20px; }
        #example-table { margin-top: 20px; }
        .tabulator-cell { font-size: 14px; }
    </style>
</head>
<body>
    <h1>Aritzia Scraped Data (${tableData.length} variants)</h1>
    <div id="example-table"></div>
    <script>
        var tableData = ${JSON.stringify(tableData)};

        var table = new Tabulator("#example-table", {
            data: tableData,
            layout: "fitColumns",
            pagination: "local",
            paginationSize: 20,
            paginationSizeSelector: [20, 50, 100, 1000],
            columns: [
                {title: "Product Link", field: "link", formatter: "link", formatterParams: {target: "_blank"}, width: 350, headerFilter: "input"},
                {title: "Color Code", field: "color_code", width: 100, headerFilter: "input"},
                {title: "Color Name", field: "color_name", headerFilter: "input"},
                {title: "Original", field: "original_price", width: 100},
                {title: "Sale", field: "sale_price", width: 100},
                {title: "Sale %", field: "sale_percent", width: 100, sorter: "number", formatter: function(cell){
                    var val = cell.getValue();
                    return val ? (val * 100).toFixed(0) + "%" : "";
                }},
            ],
            initialSort: [
                {column: "sale_percent", dir: "desc"} 
            ]
        });
    </script>
</body>
</html>`;

    fs.writeFileSync(outputPath, htmlContent);
    console.log(`Successfully generated HTML view at: ${outputPath}`);
    console.log("Open this file in your browser to view the data.");
  } catch (error) {
    console.error("Error generating view:", error);
  }
})();
