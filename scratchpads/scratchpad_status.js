const fs = require('fs');
let html = fs.readFileSync('admin/index.html', 'utf8');

const newWidget = `        <!-- RECENT UPDATES -->
        <div class="widget-card">
          <h2>Recent Approvals Activity</h2>
          <div class="updates-list" id="recent-updates-list">
            <div style="color: var(--text-secondary); font-size: 14px;">Loading activity...</div>
          </div>
        </div>

        <!-- SYSTEM STATUS -->
        <div class="widget-card">
          <h2>System Status</h2>
          
          <div class="status-row">
            <span class="status-label">Firebase Latency:</span>
            <span class="status-badge badge-green" id="sys-latency">Checking...</span>
          </div>
          
          <div class="status-row mt-4">
            <span class="status-label">Database Connection:</span>
            <span class="status-badge badge-green" id="sys-connection">Checking...</span>
          </div>

          <div class="status-row mt-4">
            <span class="status-label">Pending Approvals:</span>
            <span class="status-badge badge-orange" id="sys-queue">Checking...</span>
          </div>
        </div>`;

html = html.replace(/<!-- RECENT UPDATES -->[\s\S]*?<\/div>\s*<\/div>\s*<!-- END DASHBOARD VIEW -->/, newWidget + '\n      </div> <!-- END DASHBOARD VIEW -->');

fs.writeFileSync('admin/index.html', html);
console.log("HTML widget updated");
