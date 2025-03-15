const express = require('express');
const bodyParser = require('body-parser');
const abc2svg = require('./lib/abc2svg/abc2svg-1.js');

// 1) Parse an attribute string like: key="value" key2="value2"
function parseAttributes(attributeString) {
    // This regex captures pairs like key="value"
    // group1 => the attribute name, group2 => the attribute value
    const attrRegex = /(\S+)\s*=\s*"([^"]*)"/g;
    let match;
    const attributes = {};
  
    while ((match = attrRegex.exec(attributeString)) !== null) {
      const key = match[1];
      const value = match[2];
      attributes[key] = value;
    }
  
    return attributes;
  }
  
  // 2) Merge child attributes into a single object for the parent <svg>
  function mergeAttributes(target, source) {
    /*
      - Skip width, height, viewBox (we compute ourselves).
      - If the key is "class", concatenate (merge) classes.
      - Otherwise, if not already in target, add it.  
        (So the first child <svg> that has, say, fill="red", sets it; subsequent ones won't overwrite.)
    */
    const skip = ['width', 'height', 'viewBox'];
    for (const [key, value] of Object.entries(source)) {
      if (skip.includes(key)) {
        continue; // we skip these, because we'll set them manually
      }
      if (key === 'class') {
        // combine classes
        if (!target.class) {
          target.class = value;
        } else {
          // avoid duplicating the same class name
          const existingClasses = new Set(target.class.split(/\s+/));
          const newClasses = value.split(/\s+/);
          for (const cls of newClasses) {
            existingClasses.add(cls);
          }
          target.class = [...existingClasses].join(' ');
        }
      } else if (!target[key]) {
        // only set if not already set
        target[key] = value;
      }
      // if target[key] already exists, we do nothing — keep the first
    }
  }
  
 // 3) Combine multiple <svg> blocks into a single <svg>
function combineSVGs(svgStr) {
    // Regex to capture each <svg ...>...</svg>
    const svgRegex = /<svg([^>]*)>([\s\S]*?)<\/svg>/gi;
    const svgMatches = [...svgStr.matchAll(svgRegex)];
  
    // We'll store merged attributes here
    // We'll fill in width, height, and viewBox at the end.
    const mergedSvgAttributes = {};
  
    let offsetY = 0;
    let combinedInner = '';
    let maxWidth = 0;
    let totalHeight = 0;
  
    for (const match of svgMatches) {
      const svgAttributes = match[1];  // text inside <svg ... >
      const innerContent = match[2];   // content inside the opening/closing tags
  
      // Parse each child's <svg> attributes (e.g., xmlns, version, class, fill, etc.)
      const childAttr = parseAttributes(svgAttributes);
      // Merge them into the "global" mergedSvgAttributes
      mergeAttributes(mergedSvgAttributes, childAttr);
  
      // We still parse width/height for stacking
      const childWidth = childAttr.width ? parseFloat(childAttr.width) : 0;
      const childHeight = childAttr.height ? parseFloat(childAttr.height) : 0;
  
      if (childWidth > maxWidth) {
        maxWidth = childWidth;
      }
  
      const currentY = offsetY;
      offsetY += childHeight;
      totalHeight = offsetY;
  
      // Wrap child inner content in a <g transform="translate(0, currentY)">
      combinedInner += `<g transform="translate(0, ${currentY})">\n${innerContent}\n</g>\n`;
    }
  
    // Build the merged attributes string (excluding width/height/viewBox)
    let mergedAttrString = '';
    for (const [key, value] of Object.entries(mergedSvgAttributes)) {
      // Convert attribute object back to key="value" strings
      mergedAttrString += ` ${key}="${value}"`;
    }
  
    // Our final, single <svg>, with computed width/height/viewBox
    return `
  <svg${mergedAttrString}
    width="${maxWidth}"
    height="${totalHeight}"
    viewBox="0 0 ${maxWidth} ${totalHeight}"
  >
    ${combinedInner}
  </svg>
  `;
  }

const app = express();

// We expect ABC notation as text data in the request body
// If you'd like to parse JSON, you would use `app.use(express.json())`
app.use(bodyParser.json());

app.post('/render', (req, res) => {
  // The ABC notation data is in req.body
  console.log(req.body);
  const { abcData } = req.body;

  if (!abcData) {
    return res.status(400).send('Invalid JSON: expected { abcData: string }');
  }

  // We'll store the converted SVG data in this variable
  let svgResult = '';

  // Abc2Svg requires a callback ("svgHandler") to append the SVG strings

  var user = {
    read_file: function(fn) {
        return null;
    },
    errbld: function(sev, txt, fn, idx) {
        var msg = sev + ' ' + clean_txt(txt)
        console.log(msg);
    },
    img_out: function(str) {
        svgResult += str
    },
    anno_stop: function(type, start, stop, x, y, w, h, s) {
        console.log("anno_stop");
    },
    page_format: false
  }   

  // Create a new instance of Abc2Svg
  const abc = new abc2svg.Abc(user);

  // Convert the ABC notation to SVG
  abc.tosvg('music', abcData);

  // Set the appropriate header for SVG
  res.setHeader('Content-Type', 'image/svg+xml');

  // Send back the SVG result
  return res.send(combineSVGs(svgResult));
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
