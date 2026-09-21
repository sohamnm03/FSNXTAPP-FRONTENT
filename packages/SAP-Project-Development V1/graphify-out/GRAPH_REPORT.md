# Graph Report - SAP-Project-Development V1  (2026-09-08)

## Corpus Check
- 11 files · ~204,554 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 131 nodes · 220 edges · 9 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]

## God Nodes (most connected - your core abstractions)
1. `Handler` - 10 edges
2. `Handler` - 10 edges
3. `Handler` - 10 edges
4. `Handler` - 10 edges
5. `Handler` - 10 edges
6. `Handler` - 9 edges
7. `TcodeCreationError` - 5 edges
8. `assert_dev_system()` - 5 edges
9. `PublishError` - 5 edges
10. `publish_service_group()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `PublishError` --inherits--> `Exception`  [EXTRACTED]
  scripts\sap-gui-publish-service.py →   _Bridges community 6 → community 7_
- `Handler` --inherits--> `BaseHTTPRequestHandler`  [EXTRACTED]
  web\deal-id-console\proxy.py →   _Bridges community 0 → community 3_
- `Handler` --inherits--> `BaseHTTPRequestHandler`  [EXTRACTED]
  web\dttk-console\proxy.py →   _Bridges community 3 → community 1_
- `Handler` --inherits--> `BaseHTTPRequestHandler`  [EXTRACTED]
  web\inv-console\proxy.py →   _Bridges community 3 → community 2_
- `Handler` --inherits--> `BaseHTTPRequestHandler`  [EXTRACTED]
  web\tf-manage-console\proxy.py →   _Bridges community 3 → community 4_

## Communities (11 total, 0 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.23
Nodes (6): _fetch_token(), Handler, _opener(), proxy_request(), _service_url(), _session()

### Community 1 - "Community 1"
Cohesion: 0.23
Nodes (6): _fetch_token(), Handler, _opener(), proxy_request(), _service_url(), _session()

### Community 2 - "Community 2"
Cohesion: 0.23
Nodes (6): _fetch_token(), Handler, _opener(), proxy_request(), _service_url(), _session()

### Community 3 - "Community 3"
Cohesion: 0.23
Nodes (7): BaseHTTPRequestHandler, _fetch_token(), Handler, _opener(), proxy_request(), _service_url(), _session()

### Community 4 - "Community 4"
Cohesion: 0.23
Nodes (6): _fetch_token(), Handler, _opener(), proxy_request(), _service_url(), _session()

### Community 5 - "Community 5"
Cohesion: 0.23
Nodes (6): _fetch_token(), Handler, _opener(), proxy_request(), _service_url(), _session()

### Community 6 - "Community 6"
Cohesion: 0.33
Nodes (9): Exception, assert_dev_system(), create_report_transaction(), log(), main(), Create a report transaction code via SE93 — direct COM automation.  Frozen from, A precondition failed or SAP responded unexpectedly. Nothing assumed committed., Rule 1, enforced not assumed — refuse anything but the dev system/client.      T (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.38
Nodes (9): assert_dev_system(), find_unpublished_row(), log(), main(), publish_service_group(), PublishError, Publish an OData V4 service group via /IWFND/V4_ADMIN — direct COM automation., A precondition failed or SAP responded unexpectedly. Nothing assumed committed. (+1 more)

### Community 8 - "Community 8"
Cohesion: 0.36
Nodes (4): Get-ChecklistCounts(), Get-Lessons(), Get-Section(), Get-WorklogObjects()

## Knowledge Gaps
- **6 isolated node(s):** `Create a report transaction code via SE93 — direct COM automation.  Frozen from`, `A precondition failed or SAP responded unexpectedly. Nothing assumed committed.`, `Rule 1, enforced not assumed — refuse anything but the dev system/client.      T`, `Publish an OData V4 service group via /IWFND/V4_ADMIN — direct COM automation.`, `A precondition failed or SAP responded unexpectedly. Nothing assumed committed.` (+1 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Handler` connect `Community 0` to `Community 3`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **Why does `Handler` connect `Community 1` to `Community 3`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **Why does `Handler` connect `Community 2` to `Community 3`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **What connects `Create a report transaction code via SE93 — direct COM automation.  Frozen from`, `A precondition failed or SAP responded unexpectedly. Nothing assumed committed.`, `Rule 1, enforced not assumed — refuse anything but the dev system/client.      T` to the rest of the system?**
  _6 weakly-connected nodes found - possible documentation gaps or missing edges._