# ALV Report Standards — `REUSE_ALV_GRID_DISPLAY` and `CL_SALV_TABLE`

Authority for **ABAP executable programs (type 1) that display data in an ALV grid**: classic
list-processing reports run via SE38/SA38 or a transaction code.

Out of scope: Fiori/RAP apps, module pool programs, `CL_GUI_ALV_GRID` (editable/container grids —
if editing or a container is genuinely required, escalate; it is not covered here).

Trimmed from `ABAP Development Guide.md` (2026-08-15) to the two patterns this project builds.

---

## 1. Always ask which pattern first

**Before writing any report, ask the human which one to build:**

1. **`REUSE_ALV_GRID_DISPLAY`** (classic, `INCLUDE` + `FORM`/`PERFORM`)
2. **`CL_SALV_TABLE`** (OO, class-based)

Do not assume. Do not pick by taste. The one exception: treat "OOPS", "OOPS ALV", "OO ALV",
"OO ABAP", "object oriented", "class based", "no FORMs", or "clean core" as an explicit answer of
**2** — generate it, don't ask again, and don't argue for the classic form.

| | **A — `REUSE_ALV_GRID_DISPLAY`** | **B — `CL_SALV_TABLE`** |
|---|---|---|
| Code organisation | `INCLUDE` + `FORM`/`PERFORM` | Classes |
| Field catalog | `slis_t_fieldcat_alv`, explicit (§3) | None — DDIC driven |
| Header | `TOP_OF_PAGE` callback | `set_top_of_list( )` |
| Interaction | `USER_COMMAND` callback | `SET HANDLER` on `get_event( )` |
| Editable grid / container | No | No |
| ABAP Cloud ready | No | Yes |
| Effort | Medium | Lowest |

Force **B** regardless of the answer when the target is ABAP for Cloud / released APIs only —
`REUSE_*` does not exist there. State the chosen pattern and the reason in the header block.

**Never mix patterns in one program.** "Classic pattern" constrains architecture, not syntax:
everything inside a `FORM` is still written in current ABAP (§8 applies to both).

---

## 2. Syntax baseline

Assumed target: **ABAP 7.54+** (S/4HANA on-premise 1909+). Inline declarations, `VALUE`,
`CORRESPONDING`, `CONV`, `COND`/`SWITCH`, table expressions, string templates, `REDUCE`, `FOR`,
`LOOP AT ... GROUP BY`, and `SELECT ... INTO TABLE @DATA(lt_x)` are all free to use (7.40 SP08).
`UNION` needs 7.50, `WITH` (CTEs) 7.51, SQL string/arithmetic functions and `OVER( )` 7.51–7.53 —
verify those on the target system before relying on them.

**If the target release could be below 7.54, say so and ask** — do not silently downgrade
constructs or silently use ones the system will reject. Escaped host variables (`@lv_x`) are
mandatory in all new Open SQL regardless of release.

---

## 3. Non-negotiables

- [ ] Header block with **purpose + change log** (§7)
- [ ] Inline comments and change markers per §7.1/§7.2
- [ ] A: `TOP_OF_PAGE` and `USER_COMMAND` present — **always, in every new report**
- [ ] A: field catalog built per §4, definition-table driven
- [ ] Column labels come from the DDIC/CDS, not hardcoded `seltext_*` (§4.2)
- [ ] Escaped host variables in every `SELECT`
- [ ] Zero DB access inside `LOOP`
- [ ] No `SELECT *` from a DB table (CDS projection exception in §9)
- [ ] `sy-subrc` checked after every `SELECT`, `READ TABLE`, `CALL FUNCTION`
- [ ] Every user-facing string is a text symbol or message class entry
- [ ] `AUTHORITY-CHECK` before reading
- [ ] Amount columns carry `cfieldname`, quantity columns carry `qfieldname`
- [ ] A: `REFRESH gt_header` at the top of `TOP_OF_PAGE` (common live bug)
- [ ] Nothing from the §8 obsolete-construct list
- [ ] No `BREAK-POINT`, no stray `WRITE`

---

## 4. Field catalog (Pattern A only)

Built explicitly — `REUSE_ALV_FIELDCATALOG_MERGE` does not reliably merge CDS views or
inline-declared types. Pattern B needs none of this; SALV reads type, label, and conversion routine
straight from the DDIC.

### 4.1 Definition-table form

The column definitions **are** a `slis_t_fieldcat_alv` holding only the attributes that differ from
the default. One pass then adds `col_pos`, `tabname`, and the DDIC label reference, so adding,
removing, or reordering a column is a one-line edit and `col_pos` can never drift.

```abap
*&---------------------------------------------------------------------*
*&      Form  BUILD_FIELDCAT
*&---------------------------------------------------------------------*
*       Builds the ALV field catalog for GT_DATA.
*
*       Column order is the order of the entries below - COL_POS is
*       derived from the table index, so reordering a column is a
*       one-line edit and gaps are impossible.
*
*       Labels are deliberately NOT stored here: REF_TABNAME /
*       REF_FIELDNAME make ALV read them from the CDS view, so they are
*       maintained once in the view and translated with it. Only
*       calculated columns with no DDIC counterpart set SELTEXT_*.
*----------------------------------------------------------------------*
FORM build_fieldcat.

  DATA(lt_col) = VALUE slis_t_fieldcat_alv(
    ( fieldname = 'BUKRS'            key = abap_true )
    ( fieldname = 'RFHA'             key = abap_true
      edit_mask = gc_mask_alpha      hotspot = abap_true )
    ( fieldname = 'BUTXT' )
    ( fieldname = 'POSITION_AMT'     cfieldname = 'POSITION_CURR'
      do_sum    = abap_true )
    ( fieldname = 'POSITION_CURR' )
    ( fieldname = 'BELNR'            edit_mask = gc_mask_alpha
      hotspot   = abap_true ) ).

  " Fill the attributes that are identical for every column. BASE keeps
  " whatever was set above and adds to it.
  gt_fieldcat = VALUE #(
    FOR ls_col IN lt_col INDEX INTO lv_pos
      ( VALUE #( BASE ls_col
                 col_pos       = lv_pos
                 tabname       = gc_outtab
                 ref_tabname   = gc_cds_view
                 ref_fieldname = ls_col-fieldname ) ) ).

ENDFORM.
```

With, in the TOP include:

```abap
CONSTANTS: gc_outtab     TYPE tabname         VALUE 'GT_DATA',
           gc_cds_view   TYPE tabname         VALUE 'ZFS_CDS_RAP_004',
           gc_mask_alpha TYPE slis_edit_mask  VALUE '==ALPHA'.
```

Verify the labels actually appear on the grid. A CDS field with no `@EndUserText.label` and no
underlying data element resolves to nothing — for those columns fall back to `seltext_s/m/l` and
comment why.

**Do not use the legacy `DEFINE append_fieldcat` macro in a new report.** `DEFINE` caps at nine
placeholders, macros are invisible to the debugger and flagged obsolete by ATC/SLIN, and hardcoded
English `seltext_*` cannot be translated. When *editing* an older report that uses one, keep it and
match the existing formatting rather than converting the whole form in an unrelated change.

### 4.2 Attribute rules

| Attribute | Rule |
|---|---|
| `key` | `abap_true` only for leading identifying columns; ALV freezes them left, so they must occupy `col_pos` 1..n contiguously |
| `cfieldname` | **Required** for every `CURR` amount — names the currency field, which must itself be in the catalog. Missing it means wrong decimal places |
| `qfieldname` | **Required** for every `QUAN` quantity — names the unit field |
| `edit_mask` | `'==ALPHA'` on every field whose domain uses ALPHA conversion. Check the domain first — applying it to a field that doesn't use it is a silent display defect. Never strip leading zeros in the SELECT instead; the internal value must stay internal so drill-down and export keep working |
| `no_out` | `'X'` for fields available in the layout but hidden by default — always preferred over omitting the field |
| `hotspot` | `abap_true` on every column with a drill-down, or the user has no visual cue |
| `do_sum` | `abap_true` on amounts/quantities meaningful to total |
| `just` | `'R'`/`'L'`/`'C'` only to override the default on a character field holding a number |
| `datatype`+`intlen`+`decimals`, or `ref_tabname`+`ref_fieldname` | Required for **calculated columns** with no DDIC counterpart, else the column renders untyped and unconverted |
| `seltext_s`/`_m`/`_l` | Only for calculated columns. ≤10/≤20/≤40 chars, and always set all three — setting one leaves ALV falling back unpredictably |

**Label order of preference:** `ref_tabname`+`ref_fieldname` on the CDS view or table (default) →
a data element on a calculated column's type → `seltext_*` from **text symbols** → hardcoded
literal `seltext_*` (not acceptable in new code).

---

## 5. Pattern A — `REUSE_ALV_GRID_DISPLAY` reference

Main program is `PERFORM` calls only; logic lives in `_F01`.

```abap
*&---------------------------------------------------------------------*
*& Report ZFS_R_CASHFLOW_004
*&---------------------------------------------------------------------*
*& Purpose     : Cashflow report over CDS view ZFS_CDS_RAP_004 - lists
*&               treasury deal cashflows with bank and clearing detail
*&               for a company code / posting date range.
*& Pattern     : A (REUSE_ALV_GRID_DISPLAY) - requested by the user
*& Created by  : <UNAME>              Date : <YYYY-MM-DD>
*& Transport   : <TRKORR>             CR   : <CR-number>
*& Related     : CDS ZFS_CDS_RAP_004, message class ZFS_TEST_VS,
*&               GUI status ZALV_STATUS
*&---------------------------------------------------------------------*
*& Change log
*&---------------------------------------------------------------------*
*& Date       User      Transport     CR         Description
*& ---------- --------- ------------- ---------- -----------------------
*& 2026-08-15 <UNAME>   <TRKORR>      CR-0000    Initial creation
*&---------------------------------------------------------------------*
REPORT zfs_r_cashflow_004 NO STANDARD PAGE HEADING LINE-SIZE 255.

INCLUDE zfs_r_cashflow_004_top.   " Global data + selection screen
INCLUDE zfs_r_cashflow_004_f01.   " Subroutines

INITIALIZATION.
  PERFORM set_defaults.

AT SELECTION-SCREEN ON VALUE-REQUEST FOR p_vari.
  PERFORM f4_variant.

AT SELECTION-SCREEN.
  PERFORM validate_selection.

START-OF-SELECTION.
  PERFORM check_authority.
  PERFORM select_data.

  IF gt_data IS INITIAL.
    MESSAGE s001(zfs_test_vs) DISPLAY LIKE 'W'.   " No data for the selection
    LEAVE LIST-PROCESSING.
  ENDIF.

  PERFORM build_fieldcat.

END-OF-SELECTION.
  PERFORM display_alv.
```

### 5.1 TOP include

```abap
*&---------------------------------------------------------------------*
*& Include ZFS_R_CASHFLOW_004_TOP  - global data + selection screen
*&---------------------------------------------------------------------*

CONSTANTS: gc_outtab     TYPE tabname         VALUE 'GT_DATA',
           gc_cds_view   TYPE tabname         VALUE 'ZFS_CDS_RAP_004',
           gc_mask_alpha TYPE slis_edit_mask  VALUE '==ALPHA',
           gc_actvt_disp TYPE activ_auth      VALUE '03',
           gc_max_rows   TYPE i               VALUE 100000.

" Output table is typed directly on the CDS view: adding a field to the
" view then only needs a new field catalog entry, not a new structure.
DATA: gt_data     TYPE STANDARD TABLE OF zfs_cds_rap_004 WITH EMPTY KEY,
      gt_fieldcat TYPE slis_t_fieldcat_alv,
      gt_header   TYPE slis_t_listheader,
      gs_layout   TYPE slis_layout_alv,
      gs_variant  TYPE disvariant.

" Reference variables for SELECT-OPTIONS - avoids the obsolete TABLES
" statement and its table work area.
DATA: gv_bukrs   TYPE zfs_cds_rap_004-bukrs,
      gv_trldate TYPE zfs_cds_rap_004-trldate.

SELECTION-SCREEN BEGIN OF BLOCK b01 WITH FRAME TITLE TEXT-b01.
  SELECT-OPTIONS s_bukrs  FOR gv_bukrs OBLIGATORY.
  SELECT-OPTIONS s_trldat FOR gv_trldate.
SELECTION-SCREEN END OF BLOCK b01.

SELECTION-SCREEN BEGIN OF BLOCK b02 WITH FRAME TITLE TEXT-b02.
  PARAMETERS p_vari TYPE disvariant-variant.   " ALV display variant
SELECTION-SCREEN END OF BLOCK b02.
```

### 5.2 F01 include — required forms

Every new Pattern A report contains at least these, in this order:
`SET_DEFAULTS`, `F4_VARIANT`, `VALIDATE_SELECTION`, `CHECK_AUTHORITY`, `SELECT_DATA`,
`BUILD_FIELDCAT`, `DISPLAY_ALV`, `PF_STATUS_SET`, `TOP_OF_PAGE`, `USER_COMMAND`, `DRILLDOWN`.

```abap
*&---------------------------------------------------------------------*
*&      Form  SET_DEFAULTS
*&---------------------------------------------------------------------*
*       Selection screen defaults. Posting date defaults to the current
*       month so an accidental blank selection cannot read the whole
*       view.
*----------------------------------------------------------------------*
FORM set_defaults.

  s_trldat = VALUE #( sign   = 'I'
                      option = 'BT'
                      low    = sy-datum(6) && '01'
                      high   = sy-datum ).
  APPEND s_trldat TO s_trldat[].

ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  CHECK_AUTHORITY
*&---------------------------------------------------------------------*
*       Display authorisation per company code in the selection. A user
*       authorised for none of them is rejected before any data is read.
*----------------------------------------------------------------------*
FORM check_authority.

  SELECT bukrs
    FROM t001
    WHERE bukrs IN @s_bukrs
    INTO TABLE @DATA(lt_bukrs).

  LOOP AT lt_bukrs INTO DATA(ls_bukrs).
    AUTHORITY-CHECK OBJECT 'F_BKPF_BUK'
      ID 'BUKRS' FIELD ls_bukrs-bukrs
      ID 'ACTVT' FIELD gc_actvt_disp.
    IF sy-subrc <> 0.
      " Missing authorisation for one company code is fatal, not a
      " silent filter - a partial list would be read as complete.
      MESSAGE e004(zfs_test_vs) WITH ls_bukrs-bukrs.
    ENDIF.
  ENDLOOP.

ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  SELECT_DATA
*&---------------------------------------------------------------------*
*       Single mass read from the CDS view. SELECT * is acceptable here
*       and only here: the view is a purpose-built projection whose
*       field list IS the report output structure.
*----------------------------------------------------------------------*
FORM select_data.

  SELECT *
    FROM zfs_cds_rap_004
    WHERE bukrs   IN @s_bukrs
      AND trldate IN @s_trldat
    ORDER BY bukrs, rfha, trldate
    INTO TABLE @gt_data
    UP TO @gc_max_rows ROWS.

  IF sy-subrc <> 0.
    RETURN.                        " Empty result handled by the caller
  ENDIF.

  " Warn rather than silently truncate - a capped list that looks
  " complete is worse than no list.
  IF lines( gt_data ) = gc_max_rows.
    MESSAGE s005(zfs_test_vs) WITH gc_max_rows DISPLAY LIKE 'W'.
  ENDIF.

ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  DISPLAY_ALV
*&---------------------------------------------------------------------*
*       Displays GT_DATA via the classic ALV grid: zebra striping,
*       optimized column widths, saveable display variant, and the
*       TOP_OF_PAGE / USER_COMMAND / PF_STATUS_SET callbacks.
*----------------------------------------------------------------------*
FORM display_alv.

  gs_layout = VALUE #( zebra             = abap_true
                       colwidth_optimize = abap_true
                       detail_popup      = abap_true ).

  " The variant key must carry the report name, or saved layouts leak
  " between reports. USERNAME stays empty so both global and
  " user-specific variants are offered (I_SAVE = 'A').
  gs_variant = VALUE #( report  = sy-repid
                        variant = p_vari ).

  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY'
    EXPORTING
      i_callback_program       = sy-repid
      i_callback_top_of_page   = 'TOP_OF_PAGE'
      i_callback_user_command  = 'USER_COMMAND'
      i_callback_pf_status_set = 'PF_STATUS_SET'
      i_grid_title             = CONV lvc_title( TEXT-t01 )
      is_layout                = gs_layout
      it_fieldcat              = gt_fieldcat
      i_save                   = 'A'
      is_variant               = gs_variant
    TABLES
      t_outtab                 = gt_data
    EXCEPTIONS
      program_error            = 1
      OTHERS                   = 2.

  IF sy-subrc <> 0.
    MESSAGE ID sy-msgid TYPE sy-msgty NUMBER sy-msgno
      WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4.
  ENDIF.

ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  TOP_OF_PAGE
*&---------------------------------------------------------------------*
*       ALV TOP-OF-PAGE callback. Builds the header block and prints it
*       via REUSE_ALV_COMMENTARY_WRITE.
*----------------------------------------------------------------------*
FORM top_of_page.                                           "#EC CALLED

  DATA lv_count TYPE char10.

  " MANDATORY: this callback fires again on every page break and after
  " every grid refresh. Without REFRESH the header block grows by three
  " lines on each call.
  REFRESH gt_header.

  " Numeric values need CONDENSE - a direct assignment to INFO leaves
  " leading blanks in the printed header.
  lv_count = lines( gt_data ).
  CONDENSE lv_count.

  WRITE sy-datum TO DATA(lv_date).      " User's date format

  " Type 'H' = main title, 'S' = key/value line, 'A' = free text.
  " Exactly one 'H' line - multiple titles render inconsistently.
  gt_header = VALUE #(
    ( typ = 'H' info = TEXT-h01 )                    " Report title
    ( typ = 'S' key  = TEXT-h02 info = lv_date )     " 'Date:'
    ( typ = 'S' key  = TEXT-h03 info = lv_count ) ). " 'Records:'

  CALL FUNCTION 'REUSE_ALV_COMMENTARY_WRITE'
    EXPORTING
      it_list_commentary = gt_header.

ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  USER_COMMAND
*&---------------------------------------------------------------------*
*       ALV user command callback.
*       R_UCOMM     - function code raised by the grid
*       RS_SELFIELD - cursor position and selected row / field
*----------------------------------------------------------------------*
FORM user_command USING r_ucomm     LIKE sy-ucomm
                        rs_selfield TYPE slis_selfield.     "#EC CALLED

  CASE r_ucomm.

    WHEN '&IC1'.                       " Double-click / hotspot
      " A click on the header or on empty space also fires &IC1.
      IF rs_selfield-tabindex IS INITIAL.
        RETURN.
      ENDIF.

      READ TABLE gt_data INDEX rs_selfield-tabindex INTO DATA(ls_row).
      IF sy-subrc <> 0.
        RETURN.
      ENDIF.

      PERFORM drilldown USING rs_selfield-fieldname ls_row.

    WHEN OTHERS.
      " Custom toolbar codes from ZALV_STATUS are handled here.
  ENDCASE.

ENDFORM.
```

`PF_STATUS_SET` is `FORM pf_status_set USING rt_extab TYPE slis_t_extab. "#EC CALLED` wrapping
`SET PF-STATUS 'ZALV_STATUS' EXCLUDING rt_extab.` — the GUI status is a copy of `STANDARD` from
program `SAPLKKBL`.

`DRILLDOWN` branches on the clicked column and navigates with
`CALL TRANSACTION '<tcode>' WITH AUTHORITY-CHECK AND SKIP FIRST SCREEN` after the relevant
`SET PARAMETER ID`s. Confirm transaction codes and parameter IDs with the functional team — never
invent them.

**Rules the code above encodes:**

- Callback form names are passed as **uppercase literals** and must match the form name exactly — a
  typo fails only at runtime, silently dropping the callback. Mark them `"#EC CALLED` so SLIN does
  not report them as unused, and comment every place a callback name is passed as a literal.
- Both callbacks are generated in **every** new report, even with nothing to drill into yet. They
  are always requested in the first round of feedback, and retro-fitting means touching
  `DISPLAY_ALV`, the include, and the transport again. A stub costs six lines.
- Branch drill-down on `rs_selfield-fieldname`, one target per hotspot column. A single global
  drill-down is almost never what the user wants.
- Set `rs_selfield-refresh = abap_true` **only when the data actually changed**.
- In background the grid falls back to list output in the spool and `USER_COMMAND` never fires — so
  `LINE-SIZE` on the `REPORT` statement governs spool width, and no logic may depend on the
  callbacks running.

---

## 6. Pattern B — `CL_SALV_TABLE` reference

### 6.1 Shared data layer — interface, exception, reader

The point of OO here is that data access becomes injectable, so report logic can be unit-tested
without a database.

```abap
INTERFACE zif_fs_cashflow_reader PUBLIC.

  TYPES: ty_data_t      TYPE STANDARD TABLE OF zfs_cds_rap_004
                        WITH EMPTY KEY,
         ty_bukrs_range TYPE RANGE OF zfs_cds_rap_004-bukrs,
         ty_date_range  TYPE RANGE OF zfs_cds_rap_004-trldate.

  METHODS read
    IMPORTING it_bukrs       TYPE ty_bukrs_range
              it_date        TYPE ty_date_range
              iv_max_rows    TYPE i DEFAULT 100000
    RETURNING VALUE(rt_data) TYPE ty_data_t
    RAISING   zcx_fs_read_error.

ENDINTERFACE.
```

```abap
*&---------------------------------------------------------------------*
*& Class ZCL_FS_CASHFLOW_READER
*&---------------------------------------------------------------------*
*& Reads cashflow rows from ZFS_CDS_RAP_004. Holds no display logic and
*& issues no messages - the caller decides how to present a failure.
*&---------------------------------------------------------------------*
CLASS zcl_fs_cashflow_reader DEFINITION PUBLIC FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES zif_fs_cashflow_reader.

  PRIVATE SECTION.
    CONSTANTS c_actvt_display TYPE activ_auth VALUE '03'.

    METHODS check_authority
      IMPORTING it_bukrs TYPE zif_fs_cashflow_reader=>ty_bukrs_range
      RAISING   zcx_fs_read_error.

ENDCLASS.

CLASS zcl_fs_cashflow_reader IMPLEMENTATION.

  METHOD zif_fs_cashflow_reader~read.

    check_authority( it_bukrs ).

    SELECT * FROM zfs_cds_rap_004
      WHERE bukrs   IN @it_bukrs
        AND trldate IN @it_date
      ORDER BY bukrs, rfha, trldate
      INTO TABLE @rt_data
      UP TO @iv_max_rows ROWS.

  ENDMETHOD.

  METHOD check_authority.

    SELECT bukrs FROM t001
      WHERE bukrs IN @it_bukrs
      INTO TABLE @DATA(lt_bukrs).

    LOOP AT lt_bukrs INTO DATA(ls_bukrs).
      AUTHORITY-CHECK OBJECT 'F_BKPF_BUK'
        ID 'BUKRS' FIELD ls_bukrs-bukrs
        ID 'ACTVT' FIELD c_actvt_display.
      IF sy-subrc <> 0.
        " Missing authorisation for one company code is fatal, not a
        " silent filter - a partial list reads as complete.
        RAISE EXCEPTION TYPE zcx_fs_read_error
          MESSAGE e004(zfs_test_vs) WITH ls_bukrs-bukrs.
      ENDIF.
    ENDLOOP.

  ENDMETHOD.

ENDCLASS.
```

Create `ZCX_FS_READ_ERROR` from `CX_STATIC_CHECK` with `IF_T100_DYN_MSG` ticked — that is what makes
`RAISE EXCEPTION TYPE ... MESSAGE e004(...) WITH ...` compile. Do not put `MESSAGE` statements
inside a non-UI class; a reader that writes to the screen cannot be reused in a batch job or an API.

### 6.2 The SALV report

```abap
*&---------------------------------------------------------------------*
*& Report ZFS_R_CASHFLOW_004_OO
*&---------------------------------------------------------------------*
*& Purpose    : Cashflow report over ZFS_CDS_RAP_004 (SALV variant)
*& Pattern    : B (CL_SALV_TABLE) - requested by the user
*& Created by : <UNAME>   Date : <YYYY-MM-DD>   Transport : <TRKORR>
*&---------------------------------------------------------------------*
*& Change log
*& Date       User      Transport     CR         Description
*& ---------- --------- ------------- ---------- -----------------------
*& 2026-08-15 <UNAME>   <TRKORR>      CR-0000    Initial creation
*&---------------------------------------------------------------------*
REPORT zfs_r_cashflow_004_oo.

CLASS lcl_app DEFINITION FINAL CREATE PUBLIC.

  PUBLIC SECTION.
    " The reader is injected, not instantiated here - that is what makes
    " RUN testable without a database (see section 11).
    METHODS constructor
      IMPORTING io_reader TYPE REF TO zif_fs_cashflow_reader.

    METHODS run RAISING cx_static_check.

  PRIVATE SECTION.
    DATA mo_reader TYPE REF TO zif_fs_cashflow_reader.
    DATA mt_data   TYPE zif_fs_cashflow_reader=>ty_data_t.
    DATA mo_alv    TYPE REF TO cl_salv_table.

    METHODS build_alv   RAISING cx_salv_msg
                                cx_salv_not_found
                                cx_salv_data_error
                                cx_salv_existing.
    METHODS set_columns RAISING cx_salv_not_found.
    METHODS set_header.

    METHODS on_link_click FOR EVENT link_click
      OF cl_salv_events_table IMPORTING row column.

ENDCLASS.

DATA: gv_bukrs   TYPE zfs_cds_rap_004-bukrs,
      gv_trldate TYPE zfs_cds_rap_004-trldate.

SELECTION-SCREEN BEGIN OF BLOCK b01 WITH FRAME TITLE TEXT-b01.
  SELECT-OPTIONS s_bukrs  FOR gv_bukrs OBLIGATORY.
  SELECT-OPTIONS s_trldat FOR gv_trldate.
SELECTION-SCREEN END OF BLOCK b01.

START-OF-SELECTION.
  TRY.
      " The only place the concrete reader is named. Swapping it for a
      " test double is a one-line change.
      NEW lcl_app( io_reader = NEW zcl_fs_cashflow_reader( ) )->run( ).

    CATCH cx_root INTO DATA(lx_error).
      " Single presentation point - classes raise, the report displays.
      MESSAGE lx_error->get_text( ) TYPE 'S' DISPLAY LIKE 'E'.
  ENDTRY.

CLASS lcl_app IMPLEMENTATION.

  METHOD constructor.
    mo_reader = io_reader.
  ENDMETHOD.

  METHOD run.

    mt_data = mo_reader->read( it_bukrs = s_bukrs[]
                               it_date  = s_trldat[] ).

    IF mt_data IS INITIAL.
      MESSAGE s001(zfs_test_vs) DISPLAY LIKE 'W'.
      RETURN.
    ENDIF.

    build_alv( ).
    mo_alv->display( ).

  ENDMETHOD.

  METHOD build_alv.

    cl_salv_table=>factory(
      IMPORTING r_salv_table = mo_alv
      CHANGING  t_table      = mt_data ).

    " Standard toolbar gives sort, filter, sum, export and layout
    " management for free - never rebuild those.
    mo_alv->get_functions( )->set_all( abap_true ).

    DATA(lo_columns) = mo_alv->get_columns( ).
    lo_columns->set_optimize( abap_true ).

    " Layout key must carry the report name so saved layouts do not
    " leak between reports.
    DATA(lo_layout) = mo_alv->get_layout( ).
    lo_layout->set_key( VALUE #( report = sy-repid ) ).
    lo_layout->set_save_restriction( cl_salv_layout=>restrict_none ).

    mo_alv->get_display_settings( )->set_striped_pattern( abap_true ).

    set_columns( ).
    set_header( ).

    SET HANDLER on_link_click FOR mo_alv->get_event( ).

  ENDMETHOD.

  METHOD set_columns.

    DATA(lo_columns) = mo_alv->get_columns( ).

    " Column labels come from the CDS view automatically - only
    " behaviour is set here. ALPHA conversion is handled by the domain
    " in SALV, so no edit mask is needed.
    LOOP AT VALUE string_table( ( `RFHA` ) ( `BELNR` ) )
         INTO DATA(lv_col).
      CAST cl_salv_column_table( lo_columns->get_column( CONV #( lv_col ) )
        )->set_cell_type( if_salv_c_cell_type=>hotspot ).
    ENDLOOP.

    " Currency reference - without it amounts show wrong decimals.
    CAST cl_salv_column_list( lo_columns->get_column( 'POSITION_AMT' )
      )->set_currency_column( 'POSITION_CURR' ).

    lo_columns->set_column_position( columnname = 'BUKRS' position = 1 ).

  ENDMETHOD.

  METHOD set_header.

    DATA(lo_grid) = NEW cl_salv_form_layout_grid( ).

    lo_grid->create_header_information(
      row = 1 column = 1
      text = CONV string( TEXT-h01 ) ).

    lo_grid->create_text(
      row = 2 column = 1
      text = |{ TEXT-h03 } { lines( mt_data ) }| ).

    mo_alv->set_top_of_list( lo_grid ).

  ENDMETHOD.

  METHOD on_link_click.

    DATA(ls_row) = VALUE #( mt_data[ row ] OPTIONAL ).
    IF ls_row IS INITIAL.
      RETURN.
    ENDIF.

    CASE column.
      WHEN 'RFHA'.
        SET PARAMETER ID 'FAN' FIELD ls_row-rfha.
        CALL TRANSACTION 'TM02' WITH AUTHORITY-CHECK AND SKIP FIRST SCREEN.
      WHEN 'BELNR'.
        SET PARAMETER ID 'BUK' FIELD ls_row-bukrs.
        SET PARAMETER ID 'BLN' FIELD ls_row-belnr.
        CALL TRANSACTION 'FB03' WITH AUTHORITY-CHECK AND SKIP FIRST SCREEN.
    ENDCASE.

  ENDMETHOD.

ENDCLASS.
```

**Pattern B notes:** no field catalog and no `edit_mask` — SALV reads type, label, and conversion
routine from the DDIC, which is why it is much shorter. Hotspot columns must be cast to
`cl_salv_column_table`; currency/quantity references to `cl_salv_column_list`.

A `RETURNING` parameter cannot be typed with an inline generic
`STANDARD TABLE OF <tab> WITH EMPTY KEY` — declare a named `TYPES` alias and use that.
`IMPORTING` parameters are read-only, so copy to a local variable before passing one to
`cl_salv_table=>factory`'s `CHANGING t_table`.

### 6.3 OO design rules

Converting forms to methods without these produces something worse than Pattern A.

- **One class, one responsibility.** Reader (DB), transformer (derivations), presenter (ALV). A
  class doing all three is a `FORM` include with different punctuation.
- **No global data.** State lives in private instance attributes; anything a method needs arrives as
  a parameter or via the constructor. The `SELECT-OPTIONS` are the only permitted exception, read
  once in the report body and passed in.
- **Inject dependencies through the constructor**, typed on an interface — the whole reason for OO
  here.
- **Classes do not talk to the screen.** No `MESSAGE`, no `WRITE`, no popups inside a reader or
  transformer; raise a typed exception and let the report present it. Presenter class excepted.
- **`FINAL` by default.** Open for inheritance only when a subclass actually exists.
- **`CREATE PRIVATE` plus a factory** when the object has invariants to protect; `CREATE PUBLIC`
  otherwise. No factories for decoration.
- **Methods stay short** — one screenful. A 300-line `run( )` is a `FORM` in disguise.
- **No static state** except `CONSTANTS` — statics survive the session and make tests
  order-dependent.
- **Typed exceptions from `CX_STATIC_CHECK`**, `IF_T100_DYN_MSG` for message-class texts, one
  `CATCH cx_root` at `START-OF-SELECTION` only.
- **Global (`ZCL_`) when reused across programs, local (`lcl_`) when single-use.**
- **ABAP Cloud / clean core target:** released APIs only, `CL_SALV_TABLE`, no `REUSE_*`, no
  `CALL TRANSACTION`. Say so explicitly if this constraint changes what you generate.

---

## 7. Change log and comments

Every program carries a change log in the header block of the main program. Fixed-width columns:

```abap
*&---------------------------------------------------------------------*
*& Change log
*&---------------------------------------------------------------------*
*& Date       User      Transport     CR         Description
*& ---------- --------- ------------- ---------- -----------------------
*& 2026-07-31 SMITHJ    DEVK900123    CR-1234    Initial creation
*& 2026-08-14 PATELR    DEVK900456    CR-1789    Added clearing document
*&                                               columns and FB03
*&                                               drill-down
*&---------------------------------------------------------------------*
```

- Newest entry at the **bottom**. Never rewrite or compress existing entries.
- Date `YYYY-MM-DD`, user = SAP user ID, always both transport and CR/ticket.
- Description says **what changed and why** — not "changes" or "fix".
- Each include gets its own change log if modified independently.

### 7.1 Inline change markers

```abap
* Begin of change - PATELR - DEVK900456 - CR-1789
    ( fieldname = 'CLEARING_DOC'  edit_mask = gc_mask_alpha )
* End of change - PATELR - DEVK900456 - CR-1789
```

- Prefer **deleting** superseded code over commenting it out — version management holds the history
  and the change log records the reason. Comment out only where the customer's standard demands it,
  and then only inside markers.
- An unmarked commented-out block is a review finding.
- Markers are for maintenance changes; initial creation needs one change log line, not markers
  around the whole program.

### 7.2 Inline comments

Required:

- **Form / method header block** on every routine: name banner, one-to-three-line purpose, and the
  parameters listed where there are any.
- **Why, not what.** `" Increment counter` above `lv_n += 1` is noise.
  `" REFRESH is mandatory: callback fires on every page break` is the standard.
- A comment is **mandatory** on: non-obvious joins or `WHERE` conditions, every conversion-routine
  or `edit_mask` decision, any hardcoded value (name the CR that authorised it), workarounds for SAP
  standard behaviour (quote the note number), performance-motivated deviations, every `#EC` pragma,
  and every place a callback name is passed as a literal.
- English only. `*` in column 1 for banners; `"` at code indentation inside routines, aligned within
  the block.

Not wanted: commented-out code outside change markers, `" TODO` without a CR reference, author names
through the body (they belong in the change log), comments restating the routine name.

---

## 8. Old → new

Anything in the left column is a review finding in new or modified code.

| Do not write | Write instead |
|---|---|
| `DATA ls_x TYPE ty.` at the top, used 200 lines later | `DATA(ls_x) = ...` at first use |
| `MOVE a TO b.` | `b = a.` |
| `ADD 1 TO lv_n.` / `COMPUTE` | `lv_n += 1.` |
| `MOVE-CORRESPONDING ls_a TO ls_b.` | `ls_b = CORRESPONDING #( ls_a ).` |
| `CLEAR ls_x. ls_x-a = 1. APPEND ls_x TO lt_x.` | `APPEND VALUE #( a = 1 ) TO lt_x.` |
| `READ TABLE lt_x INTO ls_x WITH KEY k = v.` + `sy-subrc` | `VALUE #( lt_x[ k = v ] OPTIONAL )` or `line_exists( )` |
| `DESCRIBE TABLE lt_x LINES lv_n.` | `lv_n = lines( lt_x ).` |
| `CONCATENATE a b INTO c SEPARATED BY space.` | `c = \|{ a } { b }\|.` |
| `CALL METHOD lo_x->m EXPORTING ...` | `lo_x->m( iv_a = ... )` |
| `CREATE OBJECT lo_x.` | `lo_x = NEW #( ).` |
| `SELECT ... WHERE f = lv_x` (unescaped) | `WHERE f = @lv_x` |
| `SELECT SINGLE *` for an existence check | `SELECT SINGLE @abap_true FROM ... INTO @DATA(lv_exists)` |
| `TABLES vbak.` | `DATA gv_vbeln TYPE vbak-vbeln.` + `SELECT-OPTIONS ... FOR gv_vbeln` |
| `TYPE-POOLS slis.` | Nothing — SLIS types are available directly on 7.40+ |
| `LOOP AT lt_x INTO ls_x.` when modifying | `LOOP AT lt_x ASSIGNING FIELD-SYMBOL(<ls_x>).` |
| `IF lv_x = 'X'.` | `IF lv_x = abap_true.` |
| `DEFINE` macro for anything with logic | Constant table + `FOR`, or a `FORM`/method |
| `WRITE` for output | ALV |

`FORM`/`PERFORM` is **not** on this list — it is the Pattern A architecture, not an obsolete
construct.

---

## 9. SQL and performance

**Required**
- Push work to the database: `JOIN`, aggregates, `CASE`, CDS views. Classification belongs in SQL,
  not in a `LOOP` that post-processes the result.
- Prefer a join or an `EXISTS` subquery over `FOR ALL ENTRIES`. If FAE is genuinely unavoidable:
  check the driver table is not initial first (an empty driver reads the **whole** table), select all
  key fields of the target, and remember duplicate rows are eliminated.
- `WHERE` clause must hit an index — verify with ST05 for anything on a large table.
- Bound the result (`UP TO n ROWS` or `PACKAGE SIZE`) and **warn the user when the cap is hit**.
- Secondary keys or hashed tables for repeated lookups — not `SORT` + `BINARY SEARCH`.
- Convert internal→external format once, in the read layer — except leading zeros on ALPHA fields,
  which stay internal and are handled by `edit_mask`.

**Forbidden**
- `SELECT` inside `LOOP`; nested `SELECT ... ENDSELECT`
- `SELECT *` from a DB table — permitted **only** when reading a purpose-built CDS projection view
  whose field list *is* the report's output structure
- `SELECT SINGLE` without a full primary key
- Native SQL / `EXEC SQL`
- `MANDT` in the field list or `WHERE` clause
- `SORT` inside a `LOOP`
- Hardcoded company codes, org units, user names, or client numbers

---

## 10. Selection screen, messages, naming

**Selection screen**
- Group related fields in `SELECTION-SCREEN BEGIN OF BLOCK ... WITH FRAME TITLE TEXT-xxx`.
- All labels and titles from **selection texts / text symbols**, never literals.
- Declare `SELECT-OPTIONS` against a `DATA` reference variable, not via `TABLES`.
- Mark genuinely required inputs `OBLIGATORY`; validate the rest in
  `AT SELECTION-SCREEN ON <field>` with `MESSAGE e...` so focus returns to the field.
- Default any open-ended date range to something bounded so an accidental blank selection cannot
  read the whole view.
- A: offer an ALV variant parameter with `REUSE_ALV_VARIANT_F4` when `i_save = 'A'`.
- No logic requiring manual interaction — the report must run in background from a variant.

**Messages**
- Text from the project message class (`MESSAGE e001(zfs_test_vs) WITH ...`) or text symbols. No
  inline literals. See `naming-conventions.md` — `ZFS_TEST_VS` is the single project-wide class.
- Empty result: `MESSAGE s... DISPLAY LIKE 'W'` then `LEAVE LIST-PROCESSING` — returns the user to
  the selection screen rather than an empty grid.
- After `CALL FUNCTION` with `EXCEPTIONS`, check `sy-subrc` and re-raise with
  `MESSAGE ID sy-msgid TYPE sy-msgty NUMBER sy-msgno WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4`.
- Check `sy-subrc` immediately after the statement that sets it.
- Never swallow an exception with an empty `CATCH`; if it is ignorable, comment why.
- No `MESSAGE ... TYPE 'X'` unless a dump is genuinely the intended outcome.

**Naming** — `docs/naming-conventions.md` is the authority (report `ZFS_R_<AREA>_<NAME>`, includes
`<report>_TOP`/`_F01`/`_TST`). In-code prefixes: `gv_/gs_/gt_/go_` global, `gc_` global constant,
`lv_/ls_/lt_/lo_` local, `<ls_*>` field symbol, `mv_/ms_/mt_/mo_` class attribute, `c_` class
constant, `p_` parameter, `s_` select-option (max 8 chars), `lcl_`/`ltcl_`/`ltd_` local class / test
class / test double, `on_<event>` event handler, `is_*`/`has_*` boolean-returning method.
One statement per line. Run Pretty Printer (uppercase keywords, lowercase identifiers).

---

## 11. ABAP Unit

`FORM`-based code is not directly testable — a `PERFORM` cannot be doubled. Extract the logic worth
testing into a small local class and test that; the forms stay thin wrappers around it. For
Pattern B, the interface and constructor injection in §6.1 make `run( )` testable with no database
and no ALV — hand-write an `ltd_*` double for a small interface, or use
`cl_abap_testdouble=>create( )` for a wider one.

- Test what breaks silently: field catalog integrity, classification logic, date/amount derivations,
  selection-screen validation. **Do not test ALV rendering.**
- `FOR TESTING DURATION SHORT RISK LEVEL HARMLESS`, and no test may read productive data or write to
  the database.
- Minimum for a new report: tests for the field catalog (A) and for every calculation.

---

## 12. Delivery

1. **Pretty Printer**
2. **Extended Program Check (SLIN)** — zero errors; warnings fixed or justified with a commented
   pragma. Callback forms need `"#EC CALLED`
3. **ATC / Code Inspector** with the project variant — resolve priority 1 and 2
4. **ABAP Unit** — all green
5. Text symbols and selection texts maintained, including translation-relevant languages
6. Program attributes: type `1` executable, correct package and application, Unicode checks active,
   fixed point arithmetic on
7. Transportable package and transport request; report the object list in the final response
8. Never state a real transport number, client, or system name unless the user supplied it

---

## 13. Review checklist

| Area | Check |
|---|---|
| Pattern | The human was **asked** which of the two to build, and the answer was followed (§1) |
| Header | Purpose block + change log, correctly formatted (§7); chosen pattern and reason stated |
| Structure (A) | Main program is `PERFORM` calls only; logic in `_F01`; includes named per `naming-conventions.md` |
| Callbacks (A) | `TOP_OF_PAGE` **and** `USER_COMMAND` present; `REFRESH gt_header` first; `"#EC CALLED` set |
| Structure (B) | One responsibility per class; no global data; dependencies injected via constructor; methods one screenful |
| Structure (B) | No `MESSAGE`/`WRITE` inside reader or transformer classes; typed exceptions raised instead |
| Field catalog (A) | Definition-table driven; `col_pos` derived, not literal; labels from DDIC |
| Field catalog (A) | `cfieldname`/`qfieldname` on every amount/quantity; `==ALPHA` on ALPHA domains only |
| Drill-down | Every hotspot column handled; `WITH AUTHORITY-CHECK` on every `CALL TRANSACTION` |
| SQL | Escaped host variables; index-supported `WHERE`; aggregation on the DB; no `SELECT` in `LOOP` |
| SQL | Row cap present, and the user is warned when it is hit |
| Syntax | Nothing from the §8 left-hand column |
| Texts | No hardcoded user-facing strings, including header lines and column labels |
| Security | `AUTHORITY-CHECK` before reading, per org unit in the selection |
| Errors | `sy-subrc` checked everywhere; FM exceptions re-raised |
| Comments | Routine headers present; comments explain why; no unmarked commented-out code |
| Tests | `ltcl_*` covering field catalog and calculations; runs without productive data |
| Cleanliness | No dead code, no `BREAK-POINT`, no debug `WRITE` |
| Delivery | Pretty Printer, SLIN, ATC, ABAP Unit, transport assigned |

---

## 14. When to ask instead of assuming

Stop and ask if any of these are unknown:

- **Which of the two patterns to build** (§1) — always, every report
- **Target release**, if anything below 7.54 is possible
- Real DDIC/CDS source, package, transport, authorization object
- Drill-down targets: transaction codes and SET/GET parameter IDs
- Which fields use ALPHA conversion, where the domains are not visible
- Whether the report runs in background
- Whether the CDS view carries `@EndUserText.label` on every field (decides §4.2 labels)

Do not invent SAP object names, message numbers, parameter IDs, GUI status names, or authorization
objects — use clearly-labelled placeholders and flag them in the response.
