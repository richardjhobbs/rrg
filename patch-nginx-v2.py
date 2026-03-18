#!/usr/bin/env python3
import sys

conf = '/etc/nginx/sites-enabled/realrealgenuine.com'
with open(conf) as f:
    lines = f.readlines()

# Check if already patched
content = ''.join(lines)
if '/voucher/' in content:
    print('Already patched')
    sys.exit(0)

# Find the closing } of /api/creator/ block
in_block = False
insert_idx = None
for i, line in enumerate(lines):
    if 'location /api/creator/' in line:
        in_block = True
    if in_block and line.strip() == '}':
        insert_idx = i + 1
        break

if insert_idx is None:
    print('ERROR: could not find /api/creator/ closing brace')
    sys.exit(1)

voucher_block = """
    # -- Voucher routes -------------------------------------------------------
    location /voucher/ {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # -- Voucher API routes ----------------------------------------------------
    location /api/voucher/ {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
"""

lines.insert(insert_idx, voucher_block)

with open(conf, 'w') as f:
    f.writelines(lines)

print(f'Inserted voucher routes after line {insert_idx}')
