# First frontend integration contract

> **Historical document.** Written for an earlier multi-mill design and kept for reference. The current system is a single mill; see the [README](../README.md) for what exists today.

This supplements backend §10 with exact consumed fields. Backend owner must confirm before integration. No endpoint in this document is claimed implemented.

All responses use `{data: ...}`; lists add `meta:{page,limit,total}`. IDs are UUID strings; decimal values may be strings. Permissions are exact strings, not role-name checks.

| Method/path | Response data / request |
|---|---|
| GET /me/orgs | `[{id,name,types}]` |
| GET /me/orgs/:id/context | `{org:{id,name,types},role:{name},permissions:[string],scope:{}}` |
| GET /orders?page=1&limit=25&q=&status= | `[{id,order_no,buyer_name,deadline,status,priority}]` |
| POST /orders | `{seller_org_id,buyer_contact_id,deadline,priority,notes,lines:[{item_id,colour,qty,uom,rate}]}` → `{id,order_no}`; server validates contact/item ownership, quantities and pricing permission |
| GET /orders/:id | `{id,order_no,buyer_name,deadline,status,priority,notes,lines:[{id,item_name,colour,qty,uom,rate?}]}`; unauthorized rate omitted |
| POST /orders/:id/confirm | Empty body → updated order; server reserves transactionally and returns derived status |
| GET /contacts?type=buyer&page=1&limit=100 | `[{id,name}]`, paginated; UI searches on server |
| GET /items?page=1&limit=100&q= | `[{id,name,uom,colour,std_rate?}]`, paginated; UI searches on server |
| GET /stock?page=1&limit=25 | `[{item_id,item_name,colour,uom,on_hand,reserved,available,reorder_level}]` |
| GET /machines/board | `[{id,code,stage_name,status,order_no,operator_name,shift_name,today_qty,uom}]` |

UI gates: orders.view, orders.create, orders.confirm, orders.view_price, stock.view, production.view. The server must enforce those permissions independently. This first screen set is for manufacturer organizations. Supplier/buyer/transport layouts remain separate assignments.

Errors: `{error:{code,message,details?}}`; expose user-safe messages only. Abort abandoned reads. No automatic mutation retries. API defaults to http://localhost:4000/api/v1, timeout 15 seconds. Org ID is captured per request, never stored in a shared mutable interceptor. Query keys include user and org. Changing identity/organization unmounts prior screens and clears cache.
