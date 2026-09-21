# DDIC Transparent Table Template

Standard skeleton for new `ZFS_T_<AREA>_<NAME>` transparent tables (naming rule: `docs/naming-conventions.md` §Dictionary).

## Mandatory audit fields

Every new table includes these 5 fields **by default**, regardless of business content. They are
not optional and not business-driven — do not ask the user whether to include them.

```abap
local_created_by      : abp_creation_user;
local_created_at      : abp_creation_tstmpl;
local_last_changed_by : abp_locinst_lastchange_user;
local_last_changed_at : abp_locinst_lastchange_tstmpl;
last_changed_at       : abp_lastchange_tstmpl;
```

Place them as the last block of the table, after all business fields, in this exact order.

## Full skeleton

```abap
@EndUserText.label : '<Short description>'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #ALLOWED
define table <TABLE> {

  key client            : mandt not null;
  key <key_field>        : <domain> not null;
  <business_field>       : <domain>;

  @Semantics.amount.currencyCode : '<TABLE>.<currency_field>'
  <amount_field>          : <domain>;
  <currency_field>        : waers;

  local_created_by      : abp_creation_user;
  local_created_at      : abp_creation_tstmpl;
  local_last_changed_by : abp_locinst_lastchange_user;
  local_last_changed_at : abp_locinst_lastchange_tstmpl;
  last_changed_at       : abp_lastchange_tstmpl;

}
```

## Notes

- `@Semantics.amount.currencyCode` is only needed when an amount field is present; point it at the
  table's own currency field (`'<TABLE>.<currency_field>'`).
- `<TABLE>` must satisfy `ZFS_T_<AREA>_<NAME>` (max 16 chars, platform-enforced) — validate and
  record the `NAMING:` line before `createObject`/`validateNewObject`, per
  `docs/naming-conventions.md`.
- Reference example this template was distilled from (Facility for RAP — Accounting copy):

```abap
@EndUserText.label : 'Facility for RAP — Accounting copy'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #ALLOWED
define table <TABLE> {

  key client            : mandt not null;
  key co_code           : bukrs not null;
  key txn_no            : tb_rfha not null;
  bp                    : tb_kontrh;
  bp_name               : text80;
  start_date            : dblfz;
  end_date              : delfz;
  @Semantics.amount.currencyCode : '<TABLE>.currency'
  limit_amt             : tb_limit_amount;
  currency              : waers;
  local_created_by      : abp_creation_user;
  local_created_at      : abp_creation_tstmpl;
  local_last_changed_by : abp_locinst_lastchange_user;
  local_last_changed_at : abp_locinst_lastchange_tstmpl;
  last_changed_at       : abp_lastchange_tstmpl;

}
```
