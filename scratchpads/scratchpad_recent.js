const fs = require('fs');
let js = fs.readFileSync('admin/admin.js', 'utf8');

// Replace the Recent Activity rendering logic
const oldLogicPattern = /const type = data\.type[\s\S]*?recentUpdatesList\.appendChild\(div\);\n            }\);/;

const newLogic = `
                let typeTitle = 'SUBMIT BUS REQUEST';
                let description = 'Submitted new bus request';
                
                if (data.type === 'BUS_UPDATE') {
                    typeTitle = 'UPDATE BUS REQUEST';
                    description = 'Submitted bus update for ' + (data.data && data.data.route ? data.data.route : 'unknown route');
                } else if (data.type === 'BUS_CREATE') {
                    typeTitle = 'NEW BUS REQUEST';
                    description = 'Submitted new bus for ' + (data.data && data.data.route ? data.data.route : 'unknown route');
                }

                if (data.status === 'Approved') {
                    typeTitle = 'APPROVE BUS REQUEST';
                    description = 'Approved bus request for ' + (data.data && data.data.route ? data.data.route : 'unknown route');
                } else if (data.status === 'Rejected') {
                    typeTitle = 'REJECT BUS REQUEST';
                    description = 'Rejected bus request for ' + (data.data && data.data.route ? data.data.route : 'unknown route');
                }

                const email = data.submittedByEmail || 'admin';
                const timeStr = data.submittedAt ? new Date(data.submittedAt.toDate()).toLocaleString() : 'Just now';
                
                const div = document.createElement('div');
                div.style.marginBottom = '20px';
                div.style.position = 'relative';
                div.style.paddingLeft = '20px';
                
                div.innerHTML = \`
                    <div style="position: absolute; left: 0; top: 4px; width: 8px; height: 8px; background-color: #000;"></div>
                    <div style="font-weight: 600; font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase; color: #111;">\${typeTitle}</div>
                    <div style="font-size: 14px; color: #444; margin: 4px 0;">\${description}</div>
                    <div style="font-size: 12px; color: #888;">\${timeStr} &bull; by \${email}</div>
                \`;
                recentUpdatesList.appendChild(div);
            });
`;

js = js.replace(oldLogicPattern, newLogic);
fs.writeFileSync('admin/admin.js', js);
console.log("admin.js updated");
