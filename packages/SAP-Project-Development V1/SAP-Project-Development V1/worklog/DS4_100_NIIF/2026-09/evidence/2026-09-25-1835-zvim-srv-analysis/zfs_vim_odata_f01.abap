*&---------------------------------------------------------------------*
*& Include          ZFS_PS_R002_F01
*&---------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*& SCREEN 9000 - Main screen with GUI container GC_ZFIV
*&---------------------------------------------------------------------*
*  In SE51 / screen painter, create screen 9000 with:
*    - A custom container control named GC_ZFIV
*    - Full-screen (no other fields)
*    - GUI status set in MODULE STATUS_9100
*&---------------------------------------------------------------------*


*&---------------------------------------------------------------------*
*& Module STATUS_9000 OUTPUT
*&---------------------------------------------------------------------*
MODULE status_9000 OUTPUT.
  SET PF-STATUS '111'.
  SET TITLEBAR  'AAA' WITH 'Vendor Invoice Management Workbench'.

  PERFORM build_all_payloads.

ENDMODULE.


*&---------------------------------------------------------------------*
*& Module USER_COMMAND_9000 INPUT
*&---------------------------------------------------------------------*
MODULE user_command_9000 INPUT.
  " Handled by sapevent handler — nothing needed here
ENDMODULE.


*&---------------------------------------------------------------------*
*& Module USER_COMMAND_9100_EXIT INPUT
*&---------------------------------------------------------------------*
MODULE user_command_9000_exit INPUT.
  CASE sy-ucomm.
    WHEN 'BACK' OR 'EXIT' OR 'CANCEL'.
      SET SCREEN 0.
  ENDCASE.
ENDMODULE.

FORM fill_params_from_getdata
  USING
    iv_getdata TYPE string
  CHANGING
    cs_p         TYPE ty_params
    cv_file_path TYPE string.

  DATA: lv_pair        TYPE string,
        lv_key         TYPE string,
        lv_value       TYPE string,
        lv_val_decoded TYPE string,
        lt_pairs       TYPE TABLE OF string.

  CLEAR: cs_p, cv_file_path.

  SPLIT iv_getdata AT '&' INTO TABLE lt_pairs.

  LOOP AT lt_pairs INTO lv_pair.

    CLEAR: lv_key, lv_value, lv_val_decoded.

    SPLIT lv_pair AT '=' INTO lv_key lv_value.
    CONDENSE lv_key.

    lv_val_decoded = lv_value.

    cl_http_utility=>unescape_url(
      EXPORTING
        escaped   = lv_value
      RECEIVING
        unescaped = lv_val_decoded ).

    CASE lv_key.

      WHEN 'hd_comp_code' OR 'bukrs'.
        cs_p-hd_comp_code = lv_val_decoded.

      WHEN 'upl_id'.
        cs_p-file_name = lv_val_decoded.
        cs_p-upl_id    = lv_val_decoded.

      WHEN 'upl_name'.
        cs_p-file_path = lv_val_decoded.
        cs_p-upl_name  = lv_val_decoded.

      WHEN 'upl_path'.
        cs_p-upl_path = lv_val_decoded.

      WHEN 'ocr_vendor'.
        cs_p-ocr_vendor = lv_val_decoded.

      WHEN 'ocr_vendor_no'.
        cs_p-ocr_vendor_no = lv_val_decoded.

      WHEN 'ocr_vendor_addr'.
        cs_p-ocr_vendor_addr = lv_val_decoded.

      WHEN 'ocr_inv_no'.
        cs_p-ocr_inv_no = lv_val_decoded.

      WHEN 'ocr_inv_date'.
        cs_p-ocr_inv_date = lv_val_decoded.

      WHEN 'ocr_customer'.
        cs_p-ocr_customer = lv_val_decoded.

      WHEN 'ocr_subtotal'.
        cs_p-ocr_subtotal = lv_val_decoded.

      WHEN 'ocr_tax'.
        cs_p-ocr_tax = lv_val_decoded.

      WHEN 'ocr_total'.
        cs_p-ocr_total = lv_val_decoded.

      WHEN 'ocr_currency'.
        cs_p-ocr_currency = lv_val_decoded.

      WHEN 'ocr_confidence'.
        cs_p-ocr_confidence = lv_val_decoded.

      WHEN 'ocr_line_count'.
        cs_p-ocr_line_count = lv_val_decoded.

      WHEN 'mwskz'.
        cs_p-mwskz = lv_val_decoded.

      WHEN 'waers'.
        cs_p-waers = lv_val_decoded.

      WHEN 'wrbtr'.
        cs_p-wrbtr = lv_val_decoded.

      WHEN 'lifnr'.
        cs_p-lifnr = lv_val_decoded.

      WHEN 'witht'.
        cs_p-witht = lv_val_decoded.

      WHEN 'wt_withcd'.
        cs_p-wt_withcd = lv_val_decoded.

      WHEN 's_amt'.
        cs_p-s_amt = lv_val_decoded.

      WHEN 's_gst_amt'.
        cs_p-s_gst_amt = lv_val_decoded.

      WHEN 's_tds_amt'.
        cs_p-s_tds_amt = lv_val_decoded.

      WHEN 's_tds_rate'.
        cs_p-s_tds_rate = lv_val_decoded.

      WHEN 's_gst_code'.
        cs_p-s_gst_code = lv_val_decoded.

      WHEN 's_curr'.
        cs_p-s_curr = lv_val_decoded.
      WHEN 'hd_doc_type'.
        cs_p-hd_doc_type = lv_val_decoded.

      WHEN 'hd_doc_date'.
        cs_p-hd_doc_date = lv_val_decoded.

      WHEN 'hd_pstng_date'.
        cs_p-hd_pstng_date = lv_val_decoded.

      WHEN 'hd_ref_doc_no'.
        cs_p-hd_ref_doc_no = lv_val_decoded.

      WHEN 'hd_header_txt'.
        cs_p-hd_header_txt = lv_val_decoded.

      WHEN 'hd_doc_status'.
        cs_p-hd_doc_status = lv_val_decoded.

      WHEN 'hd_fisc_year'.
        cs_p-hd_fisc_year = lv_val_decoded.

      WHEN 'gl1_account'.
        cs_p-gl1_account = lv_val_decoded.

      WHEN 'gl1_cc'.
        cs_p-gl1_cc = lv_val_decoded.

      WHEN 'gl1_ba'.
        cs_p-gl1_ba = lv_val_decoded.

      WHEN 'gl1_tax_code'.
        cs_p-gl1_tax_code = lv_val_decoded.

      WHEN 'gl1_item_text'.
        cs_p-gl1_item_text = lv_val_decoded.

      WHEN 'gl1_amt_doccur'.
        cs_p-gl1_amt_doccur = lv_val_decoded.

      WHEN 'gl1_curr'.
        cs_p-gl1_curr = lv_val_decoded.

      WHEN 'ap2_vendor'.
        cs_p-ap2_vendor = lv_val_decoded.

      WHEN 'ap2_item_text'.
        cs_p-ap2_item_text = lv_val_decoded.

      WHEN 'ap2_ba'.
        cs_p-ap2_ba = lv_val_decoded.

      WHEN 'ap2_bplace'.
        cs_p-ap2_bplace = lv_val_decoded.

      WHEN 'ap2_sec_code'.
        cs_p-ap2_sec_code = lv_val_decoded.

      WHEN 'ap2_tax_code'.
        cs_p-ap2_tax_code = lv_val_decoded.

      WHEN 'ap2_amt_doccur'.
        cs_p-ap2_amt_doccur = lv_val_decoded.

      WHEN 'ap2_curr'.
        cs_p-ap2_curr = lv_val_decoded.

      WHEN 'wt3_type'.
        cs_p-wt3_type = lv_val_decoded.

      WHEN 'wt3_code'.
        cs_p-wt3_code = lv_val_decoded.

      WHEN 'wt3_bas_amt_tc'.
        cs_p-wt3_bas_amt_tc = lv_val_decoded.

      WHEN 'wt3_man_amt_tc'.
        cs_p-wt3_man_amt_tc = lv_val_decoded.

      WHEN 'wt3_has_tds'.
        cs_p-wt3_has_tds = lv_val_decoded.
      WHEN OTHERS.
        "Ignore li1_desc, li1_qty etc. unless you need to map them later

    ENDCASE.

  ENDLOOP.

  IF cs_p-upl_path IS NOT INITIAL.
    cv_file_path = cs_p-upl_path.
  ELSEIF cs_p-upl_name IS NOT INITIAL.
    cv_file_path = cs_p-upl_name.
  ELSEIF cs_p-file_path IS NOT INITIAL.
    cv_file_path = cs_p-file_path.
  ELSEIF cs_p-file_name IS NOT INITIAL.
    cv_file_path = cs_p-file_name.
  ENDIF.

ENDFORM.

FORM upload_dms_from_getdata
  USING
    iv_getdata TYPE string
  CHANGING
    cv_file_id   TYPE string
    cv_file_name TYPE string
    cv_bukrs     TYPE bukrs
    cv_message   TYPE string.

  DATA: ls_p         TYPE ty_params,
        lv_file_path TYPE string.

  CLEAR: ls_p,
         lv_file_path,
         cv_file_id,
         cv_file_name,
         cv_bukrs,
         cv_message.

  PERFORM fill_params_from_getdata
    USING iv_getdata
    CHANGING ls_p
             lv_file_path.

  IF ls_p-hd_comp_code IS INITIAL.
    ls_p-hd_comp_code = '1000'.
  ENDIF.

  IF lv_file_path IS INITIAL.
    cv_message = 'File path missing in GETDATA payload'.
    RETURN.
  ENDIF.

  PERFORM dms_new USING lv_file_path ls_p.

  cv_file_id   = ls_p-upl_id.
  cv_file_name = ls_p-upl_name.
  cv_bukrs     = ls_p-hd_comp_code.
  cv_message   = |GETDATA processed successfully: { lv_file_path }|.

ENDFORM.

FORM park_document_from_getdata
  USING
    iv_getdata TYPE string
  CHANGING
    cv_file_id   TYPE string
    cv_file_name TYPE string
    cv_bukrs     TYPE bukrs
    cv_message   TYPE string.

  DATA: ls_p         TYPE ty_params,
        lv_file_path TYPE string.

  CLEAR: ls_p,
         lv_file_path,
         cv_file_id,
         cv_file_name,
         cv_bukrs,
         cv_message.

  PERFORM fill_params_from_getdata
    USING iv_getdata
    CHANGING ls_p
             lv_file_path.

  IF ls_p-hd_comp_code IS INITIAL.
    ls_p-hd_comp_code = '1000'.
  ENDIF.

  IF ls_p-upl_id IS INITIAL.
    cv_message = 'File ID/upl_id missing in PARK GETDATA payload'.
    RETURN.
  ENDIF.

  "Reuse existing park logic
  PERFORM handle_park_document USING ls_p.

  cv_file_id   = ls_p-upl_id.
  cv_file_name = ls_p-upl_name.
  cv_bukrs     = ls_p-hd_comp_code.
  cv_message   = |Park document triggered for file: { ls_p-upl_id }|.

ENDFORM.

*&---------------------------------------------------------------------*
*& Form BUILD_ALL_PAYLOADS
*& Builds all JSON payloads, injects into HTML, loads viewer
*&---------------------------------------------------------------------*
FORM build_all_payloads.

  DATA: lo_builder TYPE REF TO lcl_json_builder.
  CREATE OBJECT lo_builder.

  " Build each dropdown dataset
  gv_cocode = lo_builder->build_payload_cocode( ).
  gv_actype = lo_builder->build_payload_actype( ).
  gv_vendor = lo_builder->build_payload_vendor( ).
  gv_gl     = lo_builder->build_payload_gl( ).
  gv_cctr   = lo_builder->build_payload_cctr( ).
  gv_ba     = lo_builder->build_payload_ba( ).
  gv_bplace = lo_builder->build_payload_bplace( ).
  gv_gst    = lo_builder->build_payload_gst( ).
  gv_sec    = lo_builder->build_payload_sec( ).
  gv_curr   = lo_builder->build_payload_curr( ).
  gv_wtype  = lo_builder->build_payload_wtype( ).
  gv_wtax   = lo_builder->build_payload_wtax( ).
  gv_prepgl = lo_builder->build_payload_prepgl( ).
  gv_ocr_records = lo_builder->build_payload_ocr_invoices( ).
  gv_lfbw   = lo_builder->build_payload_lfbw( ).
  gv_tdsgl  = lo_builder->build_payload_tdsgl( ).
  gv_taxgl  = lo_builder->build_payload_taxgl( ).   " new
  gv_parked_ids = lo_builder->build_payload_parked_ids( ).

  " Load HTML and inject all payloads
  lcl_html_display=>display_html( '' ).

ENDFORM.


*&---------------------------------------------------------------------*
*& CLASS lcl_json_builder IMPLEMENTATION
*&---------------------------------------------------------------------*
CLASS lcl_json_builder IMPLEMENTATION.

  "--------------------------------------------------------------------
  " Escape special characters for JSON strings (same as facility program)
  "--------------------------------------------------------------------
  METHOD escape_json_string.
    rv_value = iv_value.
    REPLACE ALL OCCURRENCES OF '\' IN rv_value WITH '\\'.
    REPLACE ALL OCCURRENCES OF '"' IN rv_value WITH '\"'.
    REPLACE ALL OCCURRENCES OF cl_abap_char_utilities=>newline
      IN rv_value WITH '\n'.
    REPLACE ALL OCCURRENCES OF cl_abap_char_utilities=>cr_lf
      IN rv_value WITH '\r\n'.
    REPLACE ALL OCCURRENCES OF cl_abap_char_utilities=>horizontal_tab
      IN rv_value WITH '\t'.
  ENDMETHOD.

  "--------------------------------------------------------------------
  " Build one JSON key:value field
  " iv_numeric = abap_true  -> no quotes around value  (for rate numbers)
  " iv_numeric = abap_false -> quoted string (default)
  "--------------------------------------------------------------------
  METHOD build_json_field.
    DATA lv_escaped TYPE string.
    lv_escaped = escape_json_string( iv_value ).
    IF iv_numeric = abap_true.
      rv_field = |"{ iv_key }":{ lv_escaped }|.
    ELSE.
      rv_field = |"{ iv_key }":"{ lv_escaped }"|.
    ENDIF.
  ENDMETHOD.

  "--------------------------------------------------------------------
  " Helper constant: newline used to separate JSON records.
  " Writing one JSON object per line keeps every w3html row under 200
  " chars — safe for SCMS_STRING_TO_FTEXT / w3html 255-char limit.
  "--------------------------------------------------------------------

  "--------------------------------------------------------------------
  " ZFI_COCODE
  " Source: T001 (Company Codes)
  " JSON  : [\n{"code":"1000","name":"Fourth Signal Ltd."}\n,{...}]
  "--------------------------------------------------------------------
  METHOD build_payload_cocode.
    DATA: lv_sep    TYPE string,
          lv_items  TYPE string,
          lv_record TYPE string,
          lv_nl     TYPE string.

    lv_nl = cl_abap_char_utilities=>newline.

    SELECT bukrs, butxt
      FROM t001
      INTO TABLE @DATA(lt_t001)
      WHERE bukrs IN ( '1000', '1100' )
      ORDER BY bukrs.

    CLEAR lv_sep.
    LOOP AT lt_t001 ASSIGNING FIELD-SYMBOL(<fs>).
      lv_record =
        build_json_field( iv_key = 'code' iv_value = <fs>-bukrs ) && ',' &&
        build_json_field( iv_key = 'name' iv_value = <fs>-butxt ).
      lv_items = lv_items && lv_sep && lv_nl
              && |{ '{' }{ lv_record }{ '}' }|.
      lv_sep = ','.
    ENDLOOP.

    rv_json = |[{ lv_items }{ lv_nl }]|.
  ENDMETHOD.

  "--------------------------------------------------------------------
  " ZFI_ACTYPE
  "--------------------------------------------------------------------
  METHOD build_payload_actype.
    rv_json =
      '[' &&
      '{"code":"01","name":"Vendor Invoice - Regular/Vendor Invoice - with Knock-off"}' &&
*      ,' &&
*      '{"code":"03","name":"Provision for Expenses - Payable"},' &&
*      '{"code":"04","name":"Vendor Invoice Against Provision"},' &&
*      '{"code":"05","name":"Employee Payable - Reimbursement - Single"},' &&
*      '{"code":"06","name":"Employee Payable - Reimbursement - Multi"},' &&
*      '{"code":"07","name":"Vendor Invoice - Air-tickets"},' &&
*      '{"code":"08","name":"Advance to Vendor - Payable"},' &&
*      '{"code":"09","name":"Vendor Invoice Aganist Advance"}' &&
      ']'.
  ENDMETHOD.

  "--------------------------------------------------------------------
  " ZFI_VENDOR
  " Source: LFA1 (General vendor master) + LFB1 (Company code level)
  " Filter: Only vendors with company code assignments
  "         Add further restriction by account group if needed
  " JSON  : [{"code":"0000003029","name":"Ashish Varma","bukrs":"1000"},...]
  "--------------------------------------------------------------------
  METHOD build_payload_vendor.
    DATA: lv_sep    TYPE string,
          lv_items  TYPE string,
          lv_record TYPE string,
          lv_lifnr  TYPE string,
          lv_nl     TYPE string.

    SELECT a~lifnr, a~name1, b~bukrs
      FROM lfa1 AS a
      INNER JOIN lfb1 AS b
        ON b~lifnr = a~lifnr
      INTO TABLE @DATA(lt_vendor)
      WHERE a~name1 <> ''
      AND b~bukrs IN ( '1000', '1100' )
      ORDER BY b~bukrs, a~lifnr.

    lv_nl = cl_abap_char_utilities=>newline.
    CLEAR lv_sep.
    LOOP AT lt_vendor ASSIGNING FIELD-SYMBOL(<fs>).
      " Remove leading zeros for display (same pattern as facility program)
      lv_lifnr = |{ <fs>-lifnr ALPHA = OUT }|.
      lv_record =
        build_json_field( iv_key = 'code'  iv_value = lv_lifnr     ) && ',' &&
        build_json_field( iv_key = 'name'  iv_value = <fs>-name1   ) && ',' &&
        build_json_field( iv_key = 'bukrs' iv_value = <fs>-bukrs   ).
      lv_items = lv_items && lv_sep && lv_nl
              && |{ '{' }{ lv_record }{ '}' }|.
      lv_sep = ','.
    ENDLOOP.

    rv_json = |[{ lv_items }{ lv_nl }]|.
  ENDMETHOD.

  "--------------------------------------------------------------------
  " ZFI_GL
  " Source: SKAT (G/L account descriptions) joined via T001 for ktopl
  " Filter: Language = logon language; only P&L / Expense accounts
  "         Adjust account ranges to match your chart of accounts
  " JSON  : [{"code":"40208007","name":"Vehicle Fuel","ktopl":"INT"},...]
  "--------------------------------------------------------------------
  METHOD build_payload_gl.
    DATA: lv_sep    TYPE string,
          lv_items  TYPE string,
          lv_record TYPE string,
          lv_saknr  TYPE string,
          lv_nl     TYPE string.

    " Join T001 to get ktopl (chart of accounts) for each bukrs
    SELECT DISTINCT a~ktopl, b~saknr, b~txt50
      FROM t001 AS a
      INNER JOIN skat AS b
        ON  b~ktopl = a~ktopl
        AND b~spras = @sy-langu
      INTO TABLE @DATA(lt_gl)
      WHERE b~txt50 <> ''
      AND a~bukrs IN ( '1000', '1100' )
      ORDER BY a~ktopl, b~saknr.

    lv_nl = cl_abap_char_utilities=>newline.
    CLEAR lv_sep.
    LOOP AT lt_gl ASSIGNING FIELD-SYMBOL(<fs>).
      lv_saknr = |{ <fs>-saknr ALPHA = OUT }|.
      lv_record =
        build_json_field( iv_key = 'code'  iv_value = lv_saknr   ) && ',' &&
        build_json_field( iv_key = 'name'  iv_value = <fs>-txt50 ) && ',' &&
        build_json_field( iv_key = 'ktopl' iv_value = <fs>-ktopl ).
      lv_items = lv_items && lv_sep && lv_nl
              && |{ '{' }{ lv_record }{ '}' }|.
      lv_sep = ','.
    ENDLOOP.

    rv_json = |[{ lv_items }{ lv_nl }]|.
  ENDMETHOD.

  "--------------------------------------------------------------------
  " ZFI_CCTR
  " Source: CSKT (Cost centre descriptions)
  " Filter: Language = logon language; controlling area (kokrs) = bukrs
  "         Adjust if your kokrs differs from bukrs
  " JSON  : [{"code":"1001","name":"Administration","kokrs":"1000"},...]
  "--------------------------------------------------------------------
  METHOD build_payload_cctr.
    DATA: lv_sep    TYPE string,
          lv_items  TYPE string,
          lv_record TYPE string,
          lv_kostl  TYPE string,
          lv_nl     TYPE string.

    SELECT kostl, ltext, kokrs
      FROM cskt
      INTO TABLE @DATA(lt_cc)
      WHERE spras = @sy-langu
      ORDER BY kokrs, kostl.

    lv_nl = cl_abap_char_utilities=>newline.
    CLEAR lv_sep.
    LOOP AT lt_cc ASSIGNING FIELD-SYMBOL(<fs>).
      lv_kostl = |{ <fs>-kostl ALPHA = OUT }|.
      lv_record =
        build_json_field( iv_key = 'code'  iv_value = lv_kostl   ) && ',' &&
        build_json_field( iv_key = 'name'  iv_value = <fs>-ltext ) && ',' &&
        build_json_field( iv_key = 'kokrs' iv_value = <fs>-kokrs ).
      lv_items = lv_items && lv_sep && lv_nl
              && |{ '{' }{ lv_record }{ '}' }|.
      lv_sep = ','.
    ENDLOOP.

    rv_json = |[{ lv_items }{ lv_nl }]|.
  ENDMETHOD.

  "--------------------------------------------------------------------
  " ZFI_BA
  " Source: TGSBT (Business area descriptions)
  " Filter: Language = logon language
  " JSON  : [{"code":"UP30","name":"Uttar Pradesh Region"},...]
  "--------------------------------------------------------------------
  METHOD build_payload_ba.
    DATA: lv_sep    TYPE string,
          lv_items  TYPE string,
          lv_record TYPE string,
          lv_nl     TYPE string.

    SELECT gsber, gtext
      FROM tgsbt
      INTO TABLE @DATA(lt_ba)
      WHERE spras = @sy-langu
      ORDER BY gsber.

    lv_nl = cl_abap_char_utilities=>newline.
    CLEAR lv_sep.
    LOOP AT lt_ba ASSIGNING FIELD-SYMBOL(<fs>).
      lv_record =
        build_json_field( iv_key = 'code' iv_value = <fs>-gsber ) && ',' &&
        build_json_field( iv_key = 'name' iv_value = <fs>-gtext ).
      lv_items = lv_items && lv_sep && lv_nl
              && |{ '{' }{ lv_record }{ '}' }|.
      lv_sep = ','.
    ENDLOOP.

    rv_json = |[{ lv_items }{ lv_nl }]|.
  ENDMETHOD.

  "--------------------------------------------------------------------
  " ZFI_BPLACE
  " Source: J_1BBRANCH + J_1BBRANCHT (Business places)
  "         Same logic as the default values code you shared
  " JSON  : [{"code":"1100","name":"TFSIN Banglore","bukrs":"1000"},...]
  "--------------------------------------------------------------------
  METHOD build_payload_bplace.
    DATA: lv_sep    TYPE string,
          lv_items  TYPE string,
          lv_record TYPE string,
          lv_nl     TYPE string.

    " Fetch base table
    SELECT branch, bukrs
      FROM j_1bbranch
      INTO TABLE @DATA(lt_base)
      ORDER BY bukrs, branch.

    " Fetch descriptions
    SELECT branch, bukrs, name
      FROM j_1bbrancht
      INTO TABLE @DATA(lt_desc)
      ORDER BY bukrs, branch.

    " Merge: apply name from description table
    LOOP AT lt_base ASSIGNING FIELD-SYMBOL(<fs_b>).
      ASSIGN lt_desc[ branch = <fs_b>-branch
                      bukrs  = <fs_b>-bukrs ] TO FIELD-SYMBOL(<fs_d>).
      DATA(lv_name) = COND string( WHEN sy-subrc = 0 THEN <fs_d>-name
                                   ELSE <fs_b>-branch ).
      lv_record =
        build_json_field( iv_key = 'code'  iv_value = <fs_b>-branch ) && ',' &&
        build_json_field( iv_key = 'name'  iv_value = lv_name        ) && ',' &&
        build_json_field( iv_key = 'bukrs' iv_value = <fs_b>-bukrs   ).
      lv_items = lv_items && lv_sep && lv_nl
              && |{ '{' }{ lv_record }{ '}' }|.
      lv_sep = ','.
    ENDLOOP.

    rv_json = |[{ lv_items }{ lv_nl }]|.
  ENDMETHOD.

  "--------------------------------------------------------------------
  " ZFI_GST
  " Source: T007S (Tax code descriptions) WHERE kalsm = 'ZAXINN'
  "         Same filter as your F4 help code
  "         rate field: from T007A-MWSTZ or injected from CALCULATE_TAX
  "         For now we inject 0 as rate; HTML fetches real rate via
  "         sapevent:fetch_gst -> CALCULATE_TAX_FROM_NET_AMOUNT
  " JSON  : [{"code":"G3","name":"GST 18%","rate":18},...]
*  "--------------------------------------------------------------------
*  METHOD build_payload_gst.
**    DATA: lv_sep    TYPE string,
**          lv_items  TYPE string,
**          lv_record TYPE string,
**          lv_rate   TYPE string,
**          lv_nl     TYPE string.
*
*
*
**    SELECT mwskz, text1
**      FROM t007s
**      INTO TABLE @DATA(lt_gst)
***      WHERE kalsm = 'ZAXINN'
**      WHERE kalsm = 'TAXINN'
**        AND mwskz LIKE 'J%'
**        AND spras = @sy-langu
**      ORDER BY mwskz.
*    DATA: lv_sep     TYPE string,
*          lv_items   TYPE string,
*          lv_record  TYPE string,
*          lv_gls     TYPE string,
*          lv_gl_rec  TYPE string,
*          lv_gl_sep  TYPE string,
*          lv_nl      TYPE string,
*          lv_gl_name TYPE string.
*
*    " Tax code + name only (no rate available without condition records)
*    SELECT mwskz, text1
*      FROM t007s
*      INTO TABLE @DATA(lt_gst)
*      WHERE kalsm = 'TAXINN'
*        AND mwskz LIKE 'J%'
*        AND spras = @sy-langu
*      ORDER BY mwskz.
*
*    " GL accounts per tax code from j_1it030k
*    SELECT mwskz, ktosl, konth AS hkont
*      FROM j_1it030k
*      INTO TABLE @DATA(lt_j1)
*      WHERE ktopl = '1000'
*      ORDER BY mwskz, ktosl.
*
*    " GL names from skat
*    SELECT saknr, txt50
*      FROM skat
*      INTO TABLE @DATA(lt_skat)
*      WHERE spras = @sy-langu.
*
*    lv_nl = cl_abap_char_utilities=>newline.
*    CLEAR lv_sep.
*
*    LOOP AT lt_gst ASSIGNING FIELD-SYMBOL(<fs>).
*
*      " Build gls[] — hkont only, no pct (HTML will split gstAmt equally across components)
*      CLEAR: lv_gls, lv_gl_sep.
*
*      LOOP AT lt_j1 ASSIGNING FIELD-SYMBOL(<fs_gl>)
*        WHERE mwskz = <fs>-mwskz.
*
*        CLEAR lv_gl_name.
*        READ TABLE lt_skat ASSIGNING FIELD-SYMBOL(<fs_sk>)
*          WITH KEY saknr = <fs_gl>-hkont.
*        IF sy-subrc = 0.
*          lv_gl_name = <fs_sk>-txt50.
*        ENDIF.
*
*        lv_gl_rec =
*          build_json_field( iv_key = 'hkont' iv_value = <fs_gl>-hkont ) && ',' &&
*          build_json_field( iv_key = 'name'  iv_value = lv_gl_name     ).
*
*        lv_gls = lv_gls && lv_gl_sep && lv_nl
*              && |    { '{' }{ lv_gl_rec }{ '}' }|.
*        lv_gl_sep = ','.
*      ENDLOOP.
*
*      lv_record =
*        build_json_field( iv_key = 'code' iv_value = <fs>-mwskz ) && ',' &&
*        build_json_field( iv_key = 'name' iv_value = <fs>-text1 ) && ',' &&
*        |"gls":[{ lv_gls }{ lv_nl }  ]|.
*
*      lv_items = lv_items && lv_sep && lv_nl
*              && |{ '{' }{ lv_record }{ '}' }|.
*      lv_sep = ','.
*    ENDLOOP.
*
*
*    lv_nl = cl_abap_char_utilities=>newline.
*    CLEAR lv_sep.
**    LOOP AT lt_gst ASSIGNING FIELD-SYMBOL(<fs>).
**      " Try to derive numeric rate from text (e.g. "GST 18%" -> 18)
**      " You can also add a custom Z-table for this mapping
**      DATA(lv_rate_num) = COND decfloat34(
**        WHEN <fs>-text1 CS '28' THEN '28'
**        WHEN <fs>-text1 CS '18' THEN '18'
**        WHEN <fs>-text1 CS '12' THEN '12'
**        WHEN <fs>-text1 CS '5'  THEN '5'
**        ELSE                         '0' ).
**
**      lv_rate = |{ lv_rate_num }|.
**
**      lv_record =
**        build_json_field(
**        iv_key   = 'code'
**        iv_value = <fs>-mwskz ) && ',' &&
**                   build_json_field( iv_key = 'name' iv_value = <fs>-text1 ) && ',' &&
**                   build_json_field( iv_key = 'rate' iv_value = lv_rate
**                                     iv_numeric = abap_true ).
**      lv_items = lv_items && lv_sep && lv_nl
**              && |{ '{' }{ lv_record }{ '}' }|.
**      lv_sep = ','.
**    ENDLOOP.
*
*
*    rv_json = |[{ lv_items }{ lv_nl }]|.
*  ENDMETHOD.

  METHOD build_payload_gst.
    DATA: lv_sep      TYPE string,
          lv_items    TYPE string,
          lv_record   TYPE string,
          lv_comp_sep TYPE string,
          lv_comp_arr TYPE string,
          lv_comp_rec TYPE string,
          lv_nl       TYPE string,
          lv_pct      TYPE string,
          gt_taxamt   TYPE STANDARD TABLE OF rtax1u15,
          lv_fwste    TYPE bset-fwste.

    " Get all GST tax codes (J%) with names
    SELECT mwskz, text1
      FROM t007s
      INTO TABLE @DATA(lt_gst)
      WHERE kalsm  = 'TAXINN'
        AND mwskz LIKE 'J%'
        AND spras  = @sy-langu
      ORDER BY mwskz.

    SELECT *
FROM j_1it030k
INTO TABLE @DATA(lt_j_1it030k)
WHERE ktopl = '1000'
AND bupla IN ( '2901' ).

    lv_nl = cl_abap_char_utilities=>newline.
    CLEAR lv_sep.
    DATA: lv_amount TYPE bseg-wrbtr.
    lv_amount = 100.
    LOOP AT lt_gst ASSIGNING FIELD-SYMBOL(<fs>).

      " Call FM with dummy base 100 INR to discover components + rates
      CLEAR: gt_taxamt, lv_fwste.
      CALL FUNCTION 'CALCULATE_TAX_FROM_NET_AMOUNT'
        EXPORTING
          i_bukrs           = '1000'
          i_mwskz           = <fs>-mwskz
          i_waers           = 'INR'
          i_wrbtr           = lv_amount
        IMPORTING
          e_fwnvv           = lv_fwste
        TABLES
          t_mwdat           = gt_taxamt
        EXCEPTIONS
          bukrs_not_found   = 1
          country_not_found = 2
          mwskz_not_defined = 3
          mwskz_not_valid   = 4
          ktosl_not_found   = 5
          kalsm_not_found   = 6
          parameter_error   = 7
          knumh_not_found   = 8
          kschl_not_found   = 9
          unknown_error     = 10
          account_not_found = 11
          txjcd_not_valid   = 12
          tdt_error         = 13
          txa_error         = 14
          OTHERS            = 15.

      IF sy-subrc <> 0.
        CONTINUE. " Skip tax codes that fail (not configured etc.)
      ENDIF.

      " Remove rows with no GL or zero amount — mirrors ABAP posting logic
      DELETE gt_taxamt WHERE hkont IS INITIAL.
      DELETE gt_taxamt WHERE wmwst = 0.

      IF gt_taxamt IS INITIAL.
        CONTINUE. " No components resolved — skip this code
      ENDIF.

      LOOP AT gt_taxamt ASSIGNING FIELD-SYMBOL(<fs_tax1>).
        ASSIGN lt_j_1it030k[ ktosl = <fs_tax1>-ktosl bupla = '2901'  ] TO FIELD-SYMBOL(<fs_taxgl>).
        IF sy-subrc = 0.
          <fs_tax1>-hkont = <fs_taxgl>-konts.
        ENDIF.
      ENDLOOP.


      " Build components[] array
      " pct = wmwst on base 100 = percentage directly
      CLEAR: lv_comp_arr, lv_comp_sep.

      LOOP AT gt_taxamt ASSIGNING FIELD-SYMBOL(<fs_tax>).
        " wmwst on base 100 = pct (e.g. 9.00 for CGST 9%)
        lv_pct = |{ <fs_tax>-wmwst }|.

        lv_comp_rec =
          build_json_field(
          iv_key   = 'ktosl'
          iv_value = <fs_tax>-ktosl ) && ',' &&
                     build_json_field( iv_key = 'pct'   iv_value = lv_pct
                                       iv_numeric = abap_true                       ).

        lv_comp_arr = lv_comp_arr && lv_comp_sep && lv_nl
                   && |    { '{' }{ lv_comp_rec }{ '}' }|.
        lv_comp_sep = ','.
      ENDLOOP.

      lv_record =
        build_json_field( iv_key = 'code' iv_value = <fs>-mwskz ) && ',' &&
        build_json_field( iv_key = 'name' iv_value = <fs>-text1 ) && ',' &&
        |"components":[{ lv_comp_arr }{ lv_nl }  ]|.

      lv_items = lv_items && lv_sep && lv_nl
              && |{ '{' }{ lv_record }{ '}' }|.
      lv_sep = ','.
    ENDLOOP.

    rv_json = |[{ lv_items }{ lv_nl }]|.
  ENDMETHOD.


  "--------------------------------------------------------------------
  " ZFI_SEC
  " Source: SECCODET (Section code descriptions)
  "         Same as your F4 help code for section code
  " JSON  : [{"code":"SC01","name":"TFSIN Banglore","bukrs":"1000"},...]
  "--------------------------------------------------------------------
  METHOD build_payload_sec.
    DATA: lv_sep    TYPE string,
          lv_items  TYPE string,
          lv_record TYPE string,
          lv_nl     TYPE string.

    SELECT a~seccode, b~name, a~bukrs, a~bplace
      FROM seccode AS a
      INNER JOIN seccodet AS b ON b~seccode = a~seccode
      INTO TABLE @DATA(lt_sec)
      WHERE b~spras = @sy-langu
      AND a~bukrs IN ( '1000', '1100' )
      ORDER BY a~bukrs, a~seccode.

    lv_nl = cl_abap_char_utilities=>newline.
    CLEAR lv_sep.
    LOOP AT lt_sec ASSIGNING FIELD-SYMBOL(<fs>).
      <fs>-bplace = '2901'. " for now
      lv_record =
        build_json_field( iv_key = 'code'  iv_value = <fs>-seccode ) && ',' &&
        build_json_field( iv_key = 'name'  iv_value = <fs>-name    ) && ',' &&
        build_json_field( iv_key = 'bukrs' iv_value = <fs>-bukrs   ) && ',' &&
        build_json_field( iv_key = 'bplace' iv_value = <fs>-bplace ).
      lv_items = lv_items && lv_sep && lv_nl
              && |{ '{' }{ lv_record }{ '}' }|.
      lv_sep = ','.
    ENDLOOP.

    rv_json = |[{ lv_items }{ lv_nl }]|.
  ENDMETHOD.

  "--------------------------------------------------------------------
  " ZFI_CURR
  " Source: TCURT (Currency descriptions)
  " JSON  : [{"code":"INR","name":"Indian Rupee"},...]
  "--------------------------------------------------------------------
  METHOD build_payload_curr.
    DATA: lv_sep    TYPE string,
          lv_items  TYPE string,
          lv_record TYPE string,
          lv_nl     TYPE string.

    SELECT waers, ltext
      FROM tcurt
      INTO TABLE @DATA(lt_curr)
      WHERE spras = @sy-langu
      ORDER BY waers.

    lv_nl = cl_abap_char_utilities=>newline.
    CLEAR lv_sep.
    LOOP AT lt_curr ASSIGNING FIELD-SYMBOL(<fs>).
      lv_record =
        build_json_field( iv_key = 'code' iv_value = <fs>-waers ) && ',' &&
        build_json_field( iv_key = 'name' iv_value = <fs>-ltext ).
      lv_items = lv_items && lv_sep && lv_nl
              && |{ '{' }{ lv_record }{ '}' }|.
      lv_sep = ','.
    ENDLOOP.

    rv_json = |[{ lv_items }{ lv_nl }]|.
  ENDMETHOD.

  "--------------------------------------------------------------------
  " ZFI_WTYPE
  " Source: T059P (Withholding tax types)
  " JSON  : [{"code":"C1","name":"TDS - Contractor"},...]
  "--------------------------------------------------------------------
  METHOD build_payload_wtype.
    DATA: lv_sep    TYPE string,
          lv_items  TYPE string,
          lv_record TYPE string,
          lv_nl     TYPE string.

    SELECT a~witht, b~text40
          FROM t059p AS a
          INNER JOIN t059u AS b ON b~witht = a~witht
          INTO TABLE @DATA(lt_wtype)
          WHERE b~land1 = 'IN'
            AND b~spras = @sy-langu
          ORDER BY a~witht.

    lv_nl = cl_abap_char_utilities=>newline.
    CLEAR lv_sep.
    LOOP AT lt_wtype ASSIGNING FIELD-SYMBOL(<fs>).
      lv_record =
        build_json_field( iv_key = 'code' iv_value = <fs>-witht ) && ',' &&
        build_json_field( iv_key = 'name' iv_value = <fs>-text40 ).
      lv_items = lv_items && lv_sep && lv_nl
              && |{ '{' }{ lv_record }{ '}' }|.
      lv_sep = ','.
    ENDLOOP.

    rv_json = |[{ lv_items }{ lv_nl }]|.
  ENDMETHOD.

  "--------------------------------------------------------------------
  " ZFI_WTAX
  " Source: T059Z (Withholding tax codes) with rate from T059Z-QSATZ
  "         Note: vendor-specific rate comes from lfbw at runtime
  "         (via sapevent:fetch_tds). This provides the code list only.
  " JSON  : [{"code":"194C","name":"Contractor","witht":"C1","rate":1},...]
  "--------------------------------------------------------------------
  METHOD build_payload_wtax.
    DATA: lv_sep    TYPE string,
          lv_items  TYPE string,
          lv_record TYPE string,
          lv_rate   TYPE string,
          lv_nl     TYPE string.
*
*    SELECT a~witht, a~wt_withcd, a~qsatz, b~txt30
*      FROM t059z AS a
*      LEFT OUTER JOIN t059q AS b
*        ON  b~witht    = a~witht
*        AND b~wt_withcd = a~wt_withcd
*        AND b~spras    = @sy-langu
*        AND b~land1    = 'IN'
*      INTO TABLE @DATA(lt_wtax)
*      WHERE a~land1  = 'IN'
*      ORDER BY a~witht, a~wt_withcd.
*
*    lv_nl = cl_abap_char_utilities=>newline.
*    CLEAR lv_sep.
*    LOOP AT lt_wtax ASSIGNING FIELD-SYMBOL(<fs>).
*      " qsatz is stored as percentage x 100 in some releases; adjust if needed
*      DATA(lv_rate_dec) = <fs>-qsatz / 100.
*      lv_rate = |{ lv_rate_dec }|.
*      CONDENSE lv_rate.
*
*      DATA(lv_desc) = COND string(
*        WHEN <fs>-txt30 IS NOT INITIAL THEN <fs>-txt30
*        ELSE <fs>-wt_withcd ).
*
*      lv_record =
*        build_json_field(
*        iv_key   = 'code'
*        iv_value = <fs>-wt_withcd ) && ',' &&
*                   build_json_field( iv_key = 'name' iv_value = lv_desc ) && ',' &&
*                   build_json_field( iv_key = 'witht' iv_value = <fs>-witht ) && ',' &&
*                   build_json_field( iv_key = 'rate'  iv_value = lv_rate
*                                     iv_numeric = abap_true ).
*      lv_items = lv_items && lv_sep && lv_nl
*              && |{ '{' }{ lv_record }{ '}' }|.
*      lv_sep = ','.
*    ENDLOOP.
*
*    rv_json = |[{ lv_items }{ lv_nl }]|.
  ENDMETHOD.

  "--------------------------------------------------------------------
  " ZFI_PREPGL
  " Source: /FSPL/FI_T016 (your config table for prepayment GL)
  "         Same table referenced in your gs_zfi_t0033 / FORM simulate
  " JSON  : {"code":"19000001","name":"Vendor Prepayment"}
  "--------------------------------------------------------------------
  METHOD build_payload_prepgl.
*    DATA: ls_t016   TYPE /fspl/fi_t016,   " adjust to your exact type name
*          lv_code   TYPE string,
*          lv_record TYPE string,
*          lv_nl     TYPE string.
*
*    " Fetch prepayment GL from config table for first active bukrs
*    " You may want to pass bukrs as a parameter or fetch per company
*    SELECT SINGLE *
*      FROM /fspl/fi_t016
*      INTO @ls_t016
*      WHERE zpgl IS NOT INITIAL.
*
*    IF sy-subrc = 0.
*      lv_code = |{ ls_t016-zpgl ALPHA = OUT }|.
*      lv_record =
*        build_json_field( iv_key = 'code' iv_value = lv_code         ) && ',' &&
*        build_json_field( iv_key = 'name' iv_value = ls_t016-zpgl_desc ).
*    ELSE.
*      " Fallback if config not found
*      lv_record =
*        build_json_field( iv_key = 'code' iv_value = '19000001'              ) && ',' &&
*        build_json_field( iv_key = 'name' iv_value = 'Vendor Prepayment GL'  ).
*    ENDIF.
*
*    rv_json = |{ '{' }{ lv_record }{ '}' }|.
  ENDMETHOD.


  METHOD build_payload_ocr_invoices.

    DATA: lv_items  TYPE string,
          lv_record TYPE string,
          lv_sep    TYPE string,
          lv_nl     TYPE string,
          lv_vno    TYPE string,
          lv_vname  TYPE string,
          lv_ref    TYPE string,
          lv_amt_s  TYPE string,
          lv_sub_s  TYPE string,
          lv_tax_s  TYPE string,
          lv_len    TYPE i,
          lv_ids    TYPE string.

    lv_nl = cl_abap_char_utilities=>newline.

    SELECT *
      FROM zfs_ps_t004
      INTO TABLE @DATA(lt_t004)
      WHERE status = '01'
      ORDER BY zcreated_date DESCENDING,
               zcreated_time DESCENDING.

    IF sy-subrc <> 0 OR lt_t004 IS INITIAL.
      rv_json = |[{ lv_nl }]|.
      RETURN.
    ENDIF.

    " ── Build JSON — one object per line under 180 chars ─────────────
    CLEAR: lv_items, lv_sep.

    LOOP AT lt_t004 INTO DATA(lwa).
      " Vendor number without leading zeros
      lv_vno = |{ lwa-vendor ALPHA = OUT }|.
      CONDENSE lv_vno.

      " Vendor name — keep short for line length safety
      lv_vname = lwa-vendor_name.
      IF strlen( lv_vname ) > 35.
        lv_vname = lv_vname(35).
      ENDIF.
      REPLACE ALL OCCURRENCES OF '"'  IN lv_vname WITH '\"'.
      REPLACE ALL OCCURRENCES OF '''' IN lv_vname WITH ' '.

      " Invoice reference — truncate to 25 chars
      lv_ref = lwa-reference.
      IF strlen( lv_ref ) > 25.
        lv_ref = lv_ref(25).
      ENDIF.
      REPLACE ALL OCCURRENCES OF '"' IN lv_ref WITH '\"'.

      " Amount fields — numeric string, no spaces
      lv_amt_s = |{ lwa-amt }|.
      CONDENSE lv_amt_s.
      lv_sub_s = |{ lwa-v_amt }|.
      CONDENSE lv_sub_s.
      lv_tax_s = |{ lwa-gst_amt }|.
      CONDENSE lv_tax_s.
      lv_record =
        |"n":"{ lv_ref }"| && ',' &&
        |"v":"{ lv_vno }"| && ',' &&
        |"vn":"{ lv_vname }"| && ',' &&
        |"d":"{ lwa-p_date }"| && ',' &&
        |"sb":"{ lv_sub_s }"| && ',' &&
        |"tx":"{ lv_tax_s }"| && ',' &&
        |"t":"{ lv_amt_s }"| && ',' &&
        |"c":"{ lwa-curr }"| && ',' &&
        |"f":"{ lwa-snro }"| && ',' &&
        |"dm":"{ lwa-std_dms }"| && ',' &&
        |"dn":"{ lwa-doc_no }"| && ',' &&
        |"s":"{ lwa-status }"|.


      lv_len = strlen( lv_record ).
      IF lv_len > 178.
        IF strlen( lv_vname ) > 15.
          lv_vname = lv_vname(15).
          REPLACE ALL OCCURRENCES OF '"' IN lv_vname WITH '\"'.
        ENDIF.
        lv_record =
      lv_record =
        |"n":"{ lv_ref }"| && ',' &&
        |"v":"{ lv_vno }"| && ',' &&
        |"vn":"{ lv_vname }"| && ',' &&
        |"d":"{ lwa-p_date }"| && ',' &&
        |"sb":"{ lv_sub_s }"| && ',' &&
        |"tx":"{ lv_tax_s }"| && ',' &&
        |"t":"{ lv_amt_s }"| && ',' &&
        |"c":"{ lwa-curr }"| && ',' &&
        |"f":"{ lwa-snro }"| && ',' &&
        |"dm":"{ lwa-std_dms }"| && ',' &&
        |"dn":"{ lwa-doc_no }"| && ',' &&
        |"s":"{ lwa-status }"|.
      ENDIF.

      lv_items = lv_items && lv_sep && lv_nl
              && |{ '{' }{ lv_record }{ '}' }|.
      lv_sep = ','.

    ENDLOOP.

    rv_json = |[{ lv_items }{ lv_nl }]|.



    SELECT snro
      FROM zfs_ps_t004
      INTO TABLE @DATA(lt_snro)
      WHERE status = '01'
      ORDER BY zcreated_date DESCENDING,
               zcreated_time DESCENDING.
    CLEAR: lv_ids, lv_sep.
    DATA lv_nl2 TYPE string.
    lv_nl2 = cl_abap_char_utilities=>newline.
    LOOP AT lt_snro INTO DATA(lv_snro).
      lv_ids = lv_ids && lv_sep && lv_nl2 && |"{ lv_snro-snro }"|.
      lv_sep = ','.
    ENDLOOP.
    gv_inv_list = |[{ lv_ids }{ lv_nl2 }]|.

  ENDMETHOD.

  METHOD build_payload_lfbw.
    DATA: lv_sep    TYPE string,
          lv_items  TYPE string,
          lv_record TYPE string,
          lv_lifnr  TYPE string,
          lv_nl     TYPE string,
          lv_qsatz  TYPE string.

    SELECT a~lifnr, a~bukrs, a~witht, a~wt_withcd, b~qsatz
      FROM lfbw AS a
      INNER JOIN t059z AS b
        ON  a~witht     = b~witht
        AND a~wt_withcd = b~wt_withcd
      INTO TABLE @DATA(lt_lfbw)
      WHERE a~bukrs      IN ( '1000', '1100' )
        AND b~land1      =  'IN'
        AND a~wt_subjct  =  'X'
      ORDER BY a~bukrs, a~lifnr.

    lv_nl = cl_abap_char_utilities=>newline.
    CLEAR lv_sep.

    LOOP AT lt_lfbw ASSIGNING FIELD-SYMBOL(<fs>).
      lv_lifnr = |{ <fs>-lifnr ALPHA = OUT }|.

      lv_qsatz  = |{ <fs>-qsatz }|.
      lv_record =
        build_json_field(
        iv_key   = 'lifnr'
        iv_value = lv_lifnr ) && ',' &&
                   build_json_field( iv_key = 'bukrs' iv_value = <fs>-bukrs ) && ',' &&
                   build_json_field( iv_key = 'witht' iv_value = <fs>-witht ) && ',' &&
                   build_json_field( iv_key = 'withtds' iv_value = <fs>-wt_withcd ) && ',' &&
                   build_json_field( iv_key = 'qsatz'   iv_value = lv_qsatz
                                     iv_numeric = abap_true                           ).

      lv_items = lv_items && lv_sep && lv_nl
              && |{ '{' }{ lv_record }{ '}' }|.
      lv_sep = ','.
    ENDLOOP.

    rv_json = |[{ lv_items }{ lv_nl }]|.
  ENDMETHOD.

  METHOD build_payload_tdsgl.
    DATA: lv_sep    TYPE string,
          lv_items  TYPE string,
          lv_record TYPE string,
          lv_nl     TYPE string.

    " Get TDS GL accounts from t030 (ktosl=WIT) joined with skat for GL name
    SELECT t~bwmod, t~komok, t~konts, s~txt50
      FROM t030 AS t
      INNER JOIN t001 AS c
        ON c~bukrs = '1000'                 " Use primary bukrs to resolve ktopl
      INNER JOIN skat AS s
        ON  s~saknr = t~konts
        AND s~ktopl = c~ktopl
        AND s~spras = @sy-langu
      INTO TABLE @DATA(lt_tdsgl)
      WHERE t~ktopl = c~ktopl
        AND t~ktosl = 'WIT'
        AND t~konts <> ''
      ORDER BY t~bwmod, t~komok.

    lv_nl = cl_abap_char_utilities=>newline.
    CLEAR lv_sep.

    LOOP AT lt_tdsgl ASSIGNING FIELD-SYMBOL(<fs>).
      lv_record =
        build_json_field( iv_key = 'witht'   iv_value = <fs>-bwmod  ) && ',' &&
        build_json_field( iv_key = 'withtds' iv_value = <fs>-komok  ) && ',' &&
        build_json_field( iv_key = 'hkont'   iv_value = <fs>-konts  ) && ',' &&
        build_json_field( iv_key = 'name'    iv_value = <fs>-txt50  ).

      lv_items = lv_items && lv_sep && lv_nl
              && |{ '{' }{ lv_record }{ '}' }|.
      lv_sep = ','.
    ENDLOOP.

    rv_json = |[{ lv_items }{ lv_nl }]|.
  ENDMETHOD.

  METHOD build_payload_taxgl.
    DATA: lv_sep     TYPE string,
          lv_items   TYPE string,
          lv_record  TYPE string,
          lv_nl      TYPE string,
          lv_gl_name TYPE string.

    " j_1it030k: ktosl + bupla -> GL account
    " Filter by business place 2901
    SELECT t~ktosl, t~bupla, t~konts
      FROM j_1it030k AS t
      INTO TABLE @DATA(lt_taxgl)
      WHERE t~bupla = '2901'
        AND t~konts <> ''
      ORDER BY t~ktosl, t~bupla.

    " Get GL names from skat
    SELECT saknr, txt50
      FROM skat
      INTO TABLE @DATA(lt_skat)
      WHERE spras = @sy-langu.

    lv_nl = cl_abap_char_utilities=>newline.
    CLEAR lv_sep.

    LOOP AT lt_taxgl ASSIGNING FIELD-SYMBOL(<fs>).
      " Get GL name
      CLEAR lv_gl_name.
      READ TABLE lt_skat ASSIGNING FIELD-SYMBOL(<fs_sk>)
        WITH KEY saknr = <fs>-konts.
      IF sy-subrc = 0.
        lv_gl_name = <fs_sk>-txt50.
      ENDIF.

      lv_record =
        build_json_field( iv_key = 'ktosl'  iv_value = <fs>-ktosl  ) && ',' &&
        build_json_field( iv_key = 'bupla'  iv_value = <fs>-bupla  ) && ',' &&
        build_json_field( iv_key = 'hkont'  iv_value = <fs>-konts  ) && ',' &&
        build_json_field( iv_key = 'name'   iv_value = lv_gl_name  ).

      lv_items = lv_items && lv_sep && lv_nl
              && |{ '{' }{ lv_record }{ '}' }|.
      lv_sep = ','.
    ENDLOOP.

    rv_json = |[{ lv_items }{ lv_nl }]|.
  ENDMETHOD.

  METHOD build_payload_parked_ids.
    DATA: lv_sep    TYPE string,
          lv_items  TYPE string,
          lv_nl     TYPE string,
          lv_fileid TYPE string.

    " Fetch all file IDs from ZFS_PS_T004 that have been parked (doc_no is set)
    SELECT snro
      FROM zfs_ps_t004
      WHERE status = '02'
        AND snro IS NOT INITIAL
INTO TABLE @DATA(lt_parked)      .

    lv_nl = cl_abap_char_utilities=>newline.
    CLEAR lv_sep.

    LOOP AT lt_parked ASSIGNING FIELD-SYMBOL(<fs>).
      lv_fileid = <fs>-snro.
      lv_items = lv_items && lv_sep && lv_nl
              && |"{ lv_fileid }"|.
      lv_sep = ','.
    ENDLOOP.

    rv_json = |[{ lv_items }{ lv_nl }]|.
  ENDMETHOD.


ENDCLASS.


*&---------------------------------------------------------------------*
*& CLASS lcl_html_display IMPLEMENTATION
*& Loads ZFIV HTML from SMW0 (object type HT, object id ZFIV)
*& injects all payloads, registers sapevent handler
*&---------------------------------------------------------------------*
CLASS lcl_html_display IMPLEMENTATION.

  METHOD display_html.


    DATA: lv_url      TYPE cndp_url,
          lt_html     TYPE TABLE OF w3html,
          lv_html_str TYPE string,
          ls_key      TYPE wwwdatatab.

    " ── 1. Load HTML from SMW0 ──
    ls_key-relid = 'HT'.
    ls_key-objid = 'ZFAST_ENTRY'.

    CALL FUNCTION 'WWWDATA_IMPORT'
      EXPORTING
        key               = ls_key
      TABLES
        html              = lt_html
      EXCEPTIONS
        wrong_object_type = 1
        import_error      = 2
        OTHERS            = 3.

    IF sy-subrc <> 0.
      show_error_html(
        iv_message     = 'Could not load ZFIV HTML from SMW0.'
        iv_status_code = sy-subrc ).
      RETURN.
    ENDIF.

    " ── 2. Concatenate HTML lines ──
    CONCATENATE LINES OF lt_html
      INTO lv_html_str
      SEPARATED BY cl_abap_char_utilities=>newline.

    " ── 3. Inject master data payloads ──
    REPLACE ALL OCCURRENCES OF 'ZFI_COCODE'     IN lv_html_str WITH gv_cocode.
    REPLACE ALL OCCURRENCES OF 'ZFI_ACTYPE'     IN lv_html_str WITH gv_actype.
    REPLACE ALL OCCURRENCES OF 'ZFI_VENDOR'     IN lv_html_str WITH gv_vendor.
    REPLACE ALL OCCURRENCES OF 'ZFI_GL'         IN lv_html_str WITH gv_gl.
    REPLACE ALL OCCURRENCES OF 'ZFI_CCTR'       IN lv_html_str WITH gv_cctr.
    REPLACE ALL OCCURRENCES OF 'ZFI_BA'         IN lv_html_str WITH gv_ba.
    REPLACE ALL OCCURRENCES OF 'ZFI_BPLACE'     IN lv_html_str WITH gv_bplace.
    REPLACE ALL OCCURRENCES OF 'ZFI_GST'        IN lv_html_str WITH gv_gst.
    REPLACE ALL OCCURRENCES OF 'ZFI_SEC'        IN lv_html_str WITH gv_sec.
    REPLACE ALL OCCURRENCES OF 'ZFI_CURR'       IN lv_html_str WITH gv_curr.
    REPLACE ALL OCCURRENCES OF 'ZFI_WTYPE'      IN lv_html_str WITH gv_wtype.
    REPLACE ALL OCCURRENCES OF 'ZFI_WTAX'       IN lv_html_str WITH gv_wtax.
    REPLACE ALL OCCURRENCES OF 'ZFI_PREPGL'     IN lv_html_str WITH gv_prepgl.
    REPLACE ALL OCCURRENCES OF 'ZFI_INV_LIST'   IN lv_html_str WITH gv_inv_list.
    REPLACE ALL OCCURRENCES OF 'ZFI_LFBW'       IN lv_html_str WITH gv_lfbw.
    REPLACE ALL OCCURRENCES OF 'ZFI_TDSGL'      IN lv_html_str WITH gv_tdsgl.
    REPLACE ALL OCCURRENCES OF 'ZFI_TAXGL'      IN lv_html_str WITH gv_taxgl.
    REPLACE ALL OCCURRENCES OF 'ZFI_PARKED_IDS' IN lv_html_str WITH gv_parked_ids.  " NEW

    " ── 3b. Inject result tokens ──
    REPLACE ALL OCCURRENCES OF 'ZFI_PARK_DOCNO' IN lv_html_str WITH gv_park_docno.
    REPLACE ALL OCCURRENCES OF 'ZFI_PARK_ERROR' IN lv_html_str WITH gv_park_error.

    " ── 4. Create container and viewer if not yet done ──
    IF go_html_viewer IS INITIAL.
      CREATE OBJECT go_container
        EXPORTING
          container_name = 'GC_ZFIV'.

      CREATE OBJECT go_html_viewer
        EXPORTING
          parent = go_container.

      " Register sapevent handler once
      gs_event-eventid    = cl_gui_html_viewer=>m_id_sapevent.
      gs_event-appl_event = 'X'.
      APPEND gs_event TO gt_events.
      go_html_viewer->set_registered_events( events = gt_events ).

      CREATE OBJECT go_handler.
      SET HANDLER go_handler->on_sapevent FOR go_html_viewer.
    ENDIF.

    " ── 5. Always reload HTML (runs on first load AND after park/refresh) ──
    CLEAR lt_html.
    CALL FUNCTION 'SCMS_STRING_TO_FTEXT'
      EXPORTING
        text      = lv_html_str
      TABLES
        ftext_tab = lt_html.

    go_html_viewer->load_data(
      IMPORTING
        assigned_url = lv_url
      CHANGING
        data_table   = lt_html ).

    go_html_viewer->show_url( url = lv_url ).

    " ── 6. Reset result tokens after every reload ──
    " Prevents stale park results re-injecting on next load
    CLEAR: gv_park_docno, gv_park_error.


***    DATA: lv_url      TYPE cndp_url,
***          lt_html     TYPE TABLE OF w3html,
***          lv_html_str TYPE string,
***          ls_key      TYPE wwwdatatab.
***
***    " ── 1. Load HTML from SMW0 (store zfiv_v6.html there as ZFIV) ──
***    ls_key-relid = 'HT'.
***    ls_key-objid = 'ZFAST_ENTRY'.
***
***    CALL FUNCTION 'WWWDATA_IMPORT'
***      EXPORTING
***        key               = ls_key
***      TABLES
***        html              = lt_html
***      EXCEPTIONS
***        wrong_object_type = 1
***        import_error      = 2
***        OTHERS            = 3.
***
***    IF sy-subrc <> 0.
***      show_error_html(
***        iv_message     = 'Could not load ZFIV HTML from SMW0. ' &&
***                         'Please upload zfiv_v6.html with objid = ZFIV.'
***        iv_status_code = sy-subrc ).
***      RETURN.
***      EXIT.
***    ENDIF.
***
***    " ── 2. Concatenate HTML lines into single string ──
***    CONCATENATE LINES OF lt_html
***      INTO lv_html_str
***      SEPARATED BY cl_abap_char_utilities=>newline.
***
***    " ── 3. Inject all data into hidden script tags in HTML body ──
***    " REPLACE tokens inside the <script type="text/plain" id="zfi-data-*">
***    " tags. ABAP wrote each JSON record on a separate line so no line
***    " exceeds 200 chars — safe for the w3html 255-char table.
***    REPLACE ALL OCCURRENCES OF 'ZFI_COCODE'  IN lv_html_str WITH gv_cocode.
***    REPLACE ALL OCCURRENCES OF 'ZFI_ACTYPE'  IN lv_html_str WITH gv_actype.
***    REPLACE ALL OCCURRENCES OF 'ZFI_VENDOR'  IN lv_html_str WITH gv_vendor.
***    REPLACE ALL OCCURRENCES OF 'ZFI_GL'      IN lv_html_str WITH gv_gl.
***    REPLACE ALL OCCURRENCES OF 'ZFI_CCTR'    IN lv_html_str WITH gv_cctr.
***    REPLACE ALL OCCURRENCES OF 'ZFI_BA'      IN lv_html_str WITH gv_ba.
***    REPLACE ALL OCCURRENCES OF 'ZFI_BPLACE'  IN lv_html_str WITH gv_bplace.
***    REPLACE ALL OCCURRENCES OF 'ZFI_GST'     IN lv_html_str WITH gv_gst.
***    REPLACE ALL OCCURRENCES OF 'ZFI_SEC'     IN lv_html_str WITH gv_sec.
***    REPLACE ALL OCCURRENCES OF 'ZFI_CURR'    IN lv_html_str WITH gv_curr.
***    REPLACE ALL OCCURRENCES OF 'ZFI_WTYPE'   IN lv_html_str WITH gv_wtype.
***    REPLACE ALL OCCURRENCES OF 'ZFI_WTAX'    IN lv_html_str WITH gv_wtax.
***    REPLACE ALL OCCURRENCES OF 'ZFI_PREPGL'  IN lv_html_str WITH gv_prepgl.
****    REPLACE ALL OCCURRENCES OF 'ZFI_OCR_RECORDS' IN lv_html_str WITH gv_ocr_records.
***    REPLACE ALL OCCURRENCES OF 'ZFI_INV_LIST' IN lv_html_str WITH gv_inv_list.
***    REPLACE ALL OCCURRENCES OF 'ZFI_LFBW'  IN lv_html_str WITH gv_lfbw.
***    REPLACE ALL OCCURRENCES OF 'ZFI_TDSGL' IN lv_html_str WITH gv_tdsgl.
***    REPLACE ALL OCCURRENCES OF 'ZFI_TAXGL' IN lv_html_str WITH gv_taxgl.
***    REPLACE ALL OCCURRENCES OF 'ZFI_PARKED_IDS' IN lv_html_str WITH gv_parked_ids.
***
***    " ── 3b. Inject result tokens (set by event handlers, see Option C) ──
***    " park_docno / park_error: replaced only when ABAP has a result.
***    " Default value = token string so HTML ignores them when unreplaced.
***    REPLACE ALL OCCURRENCES OF 'ZFI_PARK_DOCNO' IN lv_html_str WITH gv_park_docno.
***    REPLACE ALL OCCURRENCES OF 'ZFI_PARK_ERROR' IN lv_html_str WITH gv_park_error.
***
***    " ── 4. Create container and viewer (lazy init — same as facility) ──
***    IF go_html_viewer IS INITIAL.
***      CREATE OBJECT go_container
***        EXPORTING
***          container_name = 'GC_ZFIV'.
***
***      CREATE OBJECT go_html_viewer
***        EXPORTING
***          parent = go_container.
***
***
***      " ── 5. Convert string back to table and load into viewer ──
***      CLEAR lt_html.
***      CALL FUNCTION 'SCMS_STRING_TO_FTEXT'
***        EXPORTING
***          text      = lv_html_str
***        TABLES
***          ftext_tab = lt_html.
***
***      go_html_viewer->load_data(
***        IMPORTING
***          assigned_url = lv_url
***        CHANGING
***          data_table   = lt_html ).
***
***      " ── 6. Register sapevent handler ──
***      gs_event-eventid    = cl_gui_html_viewer=>m_id_sapevent.
***      gs_event-appl_event = 'X'.
***      APPEND gs_event TO gt_events.
***      go_html_viewer->set_registered_events( events = gt_events ).
***
***      CREATE OBJECT go_handler.
***      SET HANDLER go_handler->on_sapevent FOR go_html_viewer.
***
***      go_html_viewer->show_url( url = lv_url ).
***
***    ENDIF.

*    " ── 7. Reset result globals back to token values after every reload ──
*    " This ensures stale results are not re-injected on subsequent reloads.
*    gv_park_docno = 'ZFI_PARK_DOCNO'.
*    gv_park_error = 'ZFI_PARK_ERROR'.
*    IF go_html_viewer IS INITIAL.
*      CREATE OBJECT go_container
*        EXPORTING
*          container_name = 'GC_ZFIV'.
*
*      CREATE OBJECT go_html_viewer
*        EXPORTING
*          parent = go_container.
*    ENDIF.
*
*    " ── 5. Convert string back to table and load into viewer ──
*    CLEAR lt_html.
*    CALL FUNCTION 'SCMS_STRING_TO_FTEXT'
*      EXPORTING
*        text      = lv_html_str
*      TABLES
*        ftext_tab = lt_html.
*
*    go_html_viewer->load_data(
*      IMPORTING
*        assigned_url = lv_url
*      CHANGING
*        data_table   = lt_html ).
*
*    " ── 6. Register sapevent handler ──
*    gs_event-eventid    = cl_gui_html_viewer=>m_id_sapevent.
*    gs_event-appl_event = 'X'.
*    APPEND gs_event TO gt_events.
*    go_html_viewer->set_registered_events( events = gt_events ).
*
*    CREATE OBJECT go_handler.
*    SET HANDLER go_handler->on_sapevent FOR go_html_viewer.
*
*    go_html_viewer->show_url( url = lv_url ).

  ENDMETHOD.

  METHOD show_error_html.
    DATA lv_html TYPE string.
    lv_html =
      '<html><body style="font-family:Arial;padding:40px;color:#c00;">' &&
      '<h2>Error Loading Fast Entry (' && iv_status_code && ')</h2>' &&
      '<p>' && iv_message && '</p>' &&
      '</body></html>'.
    display_html( lv_html ).
  ENDMETHOD.

ENDCLASS.


*&---------------------------------------------------------------------*
*& CLASS lcl_html_event IMPLEMENTATION
*& Handles all sapevents fired from zfiv_v6.html
*&---------------------------------------------------------------------*
CLASS lcl_html_event IMPLEMENTATION.

  METHOD on_sapevent.

    DATA: lv_action TYPE string,
          lv_pair   TYPE string,
          lv_key    TYPE string,
          lv_value  TYPE string,
          lv_msg    TYPE string,
          lv_js     TYPE string,
          lt_pairs  TYPE TABLE OF string,
          lt_kv     TYPE TABLE OF string.

    lv_action = action.

    " ================================================================
    " Parse getdata: SPLIT AT '&' then SPLIT AT '='
    " Same pattern as facility program on_sapevent
    " ================================================================
    SPLIT getdata AT '&' INTO TABLE lt_pairs.


    DATA: ls_p TYPE ty_params.

    " Map each key=value pair into structure
    LOOP AT lt_pairs INTO lv_pair.
      CLEAR: lv_key, lv_value, lt_kv.
      SPLIT lv_pair AT '=' INTO TABLE lt_kv.
      READ TABLE lt_kv INTO lv_key   INDEX 1.
      READ TABLE lt_kv INTO lv_value INDEX 2.
      CONDENSE lv_key.

      " URL-decode the value
      DATA(lv_val_decoded) = lv_value.
      cl_http_utility=>unescape_url(
        EXPORTING
          escaped   = lv_value
        RECEIVING
          unescaped = lv_val_decoded ).

      CASE lv_key.
        WHEN 'hd_comp_code'.
          ls_p-hd_comp_code   = lv_val_decoded.
        WHEN 'hd_doc_type'.
          ls_p-hd_doc_type     = lv_val_decoded.
        WHEN 'hd_doc_date'.
          ls_p-hd_doc_date     = lv_val_decoded.
        WHEN 'hd_pstng_date'.
          ls_p-hd_pstng_date   = lv_val_decoded.
        WHEN 'hd_ref_doc_no'.
          ls_p-hd_ref_doc_no   = lv_val_decoded.
        WHEN 'hd_header_txt'.
          ls_p-hd_header_txt   = lv_val_decoded.
        WHEN 'hd_doc_status'.
          ls_p-hd_doc_status   = lv_val_decoded.
        WHEN 'hd_fisc_year'.
          ls_p-hd_fisc_year    = lv_val_decoded.
        WHEN 'gl1_account'.
          ls_p-gl1_account      = lv_val_decoded.
        WHEN 'gl1_cc'.
          ls_p-gl1_cc           = lv_val_decoded.
        WHEN 'gl1_ba'.
          ls_p-gl1_ba           = lv_val_decoded.
        WHEN 'gl1_tax_code'.
          ls_p-gl1_tax_code     = lv_val_decoded.
        WHEN 'gl1_item_text'.
          ls_p-gl1_item_text    = lv_val_decoded.
        WHEN 'gl1_amt_doccur'.
          ls_p-gl1_amt_doccur   = lv_val_decoded.
        WHEN 'gl1_curr'.
          ls_p-gl1_curr         = lv_val_decoded.
        WHEN 'ap2_vendor'.
          ls_p-ap2_vendor       = lv_val_decoded.
        WHEN 'ap2_item_text'.
          ls_p-ap2_item_text    = lv_val_decoded.
        WHEN 'ap2_ba'.
          ls_p-ap2_ba           = lv_val_decoded.
        WHEN 'ap2_bplace'.
          ls_p-ap2_bplace       = lv_val_decoded.
        WHEN 'ap2_sec_code'.
          ls_p-ap2_sec_code     = lv_val_decoded.
        WHEN 'ap2_tax_code'.
          ls_p-ap2_tax_code     = lv_val_decoded.
        WHEN 'ap2_amt_doccur'.
          ls_p-ap2_amt_doccur   = lv_val_decoded.
        WHEN 'ap2_curr'.
          ls_p-ap2_curr         = lv_val_decoded.
        WHEN 'wt3_type'.
          ls_p-wt3_type         = lv_val_decoded.
        WHEN 'wt3_code'.
          ls_p-wt3_code         = lv_val_decoded.
        WHEN 'wt3_bas_amt_tc'.
          ls_p-wt3_bas_amt_tc   = lv_val_decoded.
        WHEN 'wt3_man_amt_tc'.
          ls_p-wt3_man_amt_tc   = lv_val_decoded.
        WHEN 'wt3_has_tds'.
          ls_p-wt3_has_tds      = lv_val_decoded.
        WHEN 's_amt'.
          ls_p-s_amt            = lv_val_decoded.
        WHEN 's_gst_amt'.
          ls_p-s_gst_amt        = lv_val_decoded.
        WHEN 's_tds_amt'.
          ls_p-s_tds_amt        = lv_val_decoded.
        WHEN 's_tds_rate'.
          ls_p-s_tds_rate       = lv_val_decoded.
        WHEN 's_gst_code'.
          ls_p-s_gst_code       = lv_val_decoded.
        WHEN 's_curr'.
          ls_p-s_curr           = lv_val_decoded.
        WHEN 'bukrs'.
          ls_p-hd_comp_code     = lv_val_decoded.
        WHEN 'mwskz'.
          ls_p-mwskz            = lv_val_decoded.
        WHEN 'waers'.
          ls_p-waers            = lv_val_decoded.
        WHEN 'wrbtr'.
          ls_p-wrbtr            = lv_val_decoded.
        WHEN 'lifnr'.
          ls_p-lifnr            = lv_val_decoded.
        WHEN 'witht'.
          ls_p-witht            = lv_val_decoded.
        WHEN 'wt_withcd'.
          ls_p-wt_withcd        = lv_val_decoded.
        WHEN 'upl_id'.
          ls_p-file_name = lv_val_decoded.
          ls_p-upl_id         = lv_val_decoded.
        WHEN 'upl_name'.
          ls_p-file_path = lv_val_decoded.
          ls_p-upl_name       = lv_val_decoded.
        WHEN 'ocr_vendor'.
          ls_p-ocr_vendor     = lv_val_decoded.
        WHEN 'ocr_vendor_no'.
          ls_p-ocr_vendor_no  = lv_val_decoded.
        WHEN 'ocr_vendor_addr'.
          ls_p-ocr_vendor_addr = lv_val_decoded.
        WHEN 'ocr_inv_no'.
          ls_p-ocr_inv_no     = lv_val_decoded.
        WHEN 'ocr_inv_date'.
          ls_p-ocr_inv_date   = lv_val_decoded.
        WHEN 'ocr_customer'.
          ls_p-ocr_customer   = lv_val_decoded.
        WHEN 'ocr_subtotal'.
          ls_p-ocr_subtotal   = lv_val_decoded.
        WHEN 'ocr_tax'.
          ls_p-ocr_tax        = lv_val_decoded.
        WHEN 'ocr_total'.
          ls_p-ocr_total      = lv_val_decoded.
        WHEN 'ocr_currency'.
          ls_p-ocr_currency   = lv_val_decoded.
        WHEN 'ocr_confidence'.
          ls_p-ocr_confidence = lv_val_decoded.
        WHEN 'ocr_line_count'.
          ls_p-ocr_line_count = lv_val_decoded.
      ENDCASE.
    ENDLOOP.

    " ================================================================
    " ROUTE ACTION
    " ================================================================
    CASE lv_action.

        " --------------------------------------------------------------
        " ACTION: fetch_gst
        " Fires: sapevent:fetch_gst?bukrs=..&mwskz=..&waers=..&wrbtr=..
        " Calls: CALCULATE_TAX_FROM_NET_AMOUNT
        " Returns GST amount to HTML via execute_script
        " --------------------------------------------------------------
      WHEN 'fetch_gst'.
        PERFORM handle_fetch_gst USING ls_p-hd_comp_code
                                       ls_p-mwskz
                                       ls_p-waers
                                       ls_p-wrbtr.

        " --------------------------------------------------------------
        " ACTION: fetch_tds
        " Fires: sapevent:fetch_tds?bukrs=..&lifnr=..&witht=..&wt_withcd=..
        " Queries lfbw + t059z for vendor-specific TDS rate
        " Returns rate to HTML via execute_script
        " --------------------------------------------------------------
      WHEN 'fetch_tds'.
        PERFORM handle_fetch_tds USING ls_p-hd_comp_code
                                       ls_p-lifnr
                                       ls_p-witht
                                       ls_p-wt_withcd.

        " --------------------------------------------------------------
        " ACTION: park_document
        " Fires: sapevent:park_document?<flat params>
        " Calls: BAPI_ACC_DOCUMENT_SAVE (doc_status=2 = Park)
        " Returns doc number to HTML via execute_script
        " --------------------------------------------------------------
      WHEN 'when_document'.
        PERFORM handle_park_document USING ls_p.

        " --------------------------------------------------------------
        " ACTION: refresh_screen
        " Fires: sapevent:refresh_screen?ts=<timestamp>
        " Reloads the screen + rebuilds all payloads
        " --------------------------------------------------------------
      WHEN 'refresh_screen'.
        PERFORM build_all_payloads.

      WHEN 'upload_dms'.

        lv_file_path = VALUE #( query_table[ name = 'upl_path' ]-value OPTIONAL ).
        IF lv_file_path IS NOT INITIAL.
          PERFORM dms_new USING lv_file_path ls_p.
        ENDIF.
      WHEN 'download_dms'.
        DATA: lv_std_dms TYPE doknr,
              lv_file_id TYPE char30.
        lv_file_id = ls_p-upl_id.

        SELECT SINGLE std_dms FROM zfs_ps_t004
          INTO lv_std_dms
          WHERE snro = lv_file_id
          .
*        lv_std_dms = VALUE #( query_table[ name = 'std_dms' ]-value OPTIONAL ).

        PERFORM download_doc USING lv_std_dms.
    ENDCASE.

  ENDMETHOD.

ENDCLASS.


*&---------------------------------------------------------------------*
*& Form HANDLE_FETCH_GST
*& Option C: GST is calculated browser-side from the rate injected in
*& master data (ZFI_GST includes rate field from T007S / custom table).
*& The sapevent fetch_gst is received here but no action is needed —
*& the HTML already has the rate and calculates GST amount locally.
*& For 100% SAP-accurate GST: CALCULATE_TAX_FROM_NET_AMOUNT is called
*& at park time in ABAP (amounts in BAPI are already correct).
*& If you need SAP-calculated GST displayed in HTML before park, use the
*& page reload approach: set gv_gst_result here and call display_html.
*&---------------------------------------------------------------------*
FORM handle_fetch_gst
  USING pv_bukrs TYPE bukrs
        pv_mwskz TYPE mwskz
        pv_waers TYPE waers
        pv_wrbtr TYPE string.

  " Option C: No action required here.
  " GST amount is calculated in the HTML from the rate in ZFI_GST master data.
  " The sapevent is fired by the HTML but ABAP does not need to respond.
  " The browser fallback in the HTML handles the calculation immediately.

  " If you later need SAP-side GST amount to appear in the HTML,
  " implement the reload approach here (same as handle_park_document):
  "   1. Call CALCULATE_TAX_FROM_NET_AMOUNT
  "   2. Store result in a new global e.g. gv_gst_result
  "   3. Add REPLACE 'ZFI_GST_RESULT' in display_html
  "   4. Add applyResults() in HTML JS to read the token on load
  "   5. Call lcl_html_display=>display_html( '' ) to reload

ENDFORM.


*&---------------------------------------------------------------------*
*& Form HANDLE_FETCH_TDS
*& Option C: TDS rate is fetched browser-side from the rate in ZFI_WTAX
*& master data (injected from T059Z-QSATZ at page load).
*& The sapevent fetch_tds is received here but no action is needed —
*& the HTML already has the rate per wtax code and calculates locally.
*& Vendor-specific rate override: if lfbw has a different rate for this
*& vendor, inject it into ZFI_WTAX at page load time per vendor.
*& For runtime vendor-specific TDS, use the reload approach below.
*&---------------------------------------------------------------------*
FORM handle_fetch_tds
  USING pv_bukrs    TYPE bukrs
        pv_lifnr    TYPE lifnr
        pv_witht    TYPE string
        pv_withcd   TYPE string.

  " Option C: No action required here.
  " TDS rate is pre-loaded in the HTML from ZFI_WTAX (T059Z-QSATZ).
  " The sapevent is fired by the HTML but ABAP does not need to respond.
  " The browser fallback in the HTML applies the rate immediately.

  " If vendor-specific TDS rate override is needed at runtime:
  "   1. SELECT qsatz FROM lfbw JOIN t059z WHERE lifnr + bukrs + witht + wt_withcd
  "   2. Store in a new global e.g. gv_tds_result
  "   3. Add REPLACE 'ZFI_TDS_RESULT' in display_html
  "   4. Add applyResults() in HTML JS to read the token on load
  "   5. Call lcl_html_display=>display_html( '' ) to reload

ENDFORM.


*&---------------------------------------------------------------------*
*& Form HANDLE_PARK_DOCUMENT
*& Maps flat HTML params to BAPI_ACC_DOCUMENT_SAVE structures
*& Mirrors ABAP FORM park_document from your fast entry program
*&---------------------------------------------------------------------*
FORM handle_park_document
  USING ls_p TYPE ty_params.        " ty_params defined in on_sapevent
  DATA: lv_doc          TYPE belnr_d,
        lv_amt          TYPE tb_limit_amount,   " Fix 4: was bseg-wrbtr
        lv_fyear        TYPE c LENGTH 4,
        lv_gst_amt_bapi TYPE tb_limit_amount,
        lv_gl_amt       TYPE bseg-wrbtr,
        lv_base_amt     TYPE bseg-wrbtr,
        lv_err          TYPE string,
        lv_pid_sep      TYPE string,
        lv_pid_items    TYPE string,
        lv_pid_nl       TYPE string.

  " ── Clear all BAPI structures ──────────────────────────────────
  CLEAR: gv_itemno,
         gs_accountgl,        gt_accountgl,
         gs_accountpayable,   gt_accountpayable,
         gs_accountreceivable,gt_accountreceivable,
         gs_accounttax,       gt_accounttax,
         gs_accountwt,        gt_accountwt,
         gs_currencyamount,   gt_currencyamount,
         gs_documentheader,   gt_return.

  " ── Document Header ────────────────────────────────────────────
  gs_documentheader-comp_code  = ls_p-hd_comp_code.
  gs_documentheader-doc_date   = ls_p-hd_doc_date.
  gs_documentheader-doc_type   = 'KR'.
  gs_documentheader-pstng_date = ls_p-hd_pstng_date.
  gs_documentheader-ref_doc_no = ls_p-hd_ref_doc_no.
  gs_documentheader-header_txt = ls_p-hd_header_txt.
  gs_documentheader-doc_status = '2'.
  gs_documentheader-username = sy-uname.

  CALL FUNCTION 'GM_GET_FISCAL_YEAR'
    EXPORTING
      i_date = ls_p-hd_pstng_date
      i_fyv  = 'V3'
    IMPORTING
      e_fy   = lv_fyear.

  " ── GL Line Item (Expense GL) ──────────────────────────────────
  gv_itemno = gv_itemno + 1.
  gs_accountgl-itemno_acc = gv_itemno.
  gs_accountgl-gl_account = |{ ls_p-gl1_account ALPHA = IN }|.
  gs_accountgl-costcenter = |{ ls_p-gl1_cc ALPHA = IN }|.
  gs_accountgl-bus_area   = ls_p-gl1_ba.
  gs_accountgl-tax_code = ls_p-gl1_tax_code.
  IF ls_p-gl1_tax_code IS NOT INITIAL.
    gs_accountgl-itemno_tax = gv_itemno.  " Fix 3: links GL line to tax — was missing
  ENDIF.
  APPEND gs_accountgl TO gt_accountgl.
  CLEAR gs_accountgl.

  " ── Currency Amount for GL line ────────────────────────────────
  gs_currencyamount-itemno_acc   = gv_itemno.
  gs_currencyamount-currency     = ls_p-gl1_curr.
  gs_currencyamount-currency_iso = ls_p-gl1_curr.
  gs_currencyamount-amt_doccur = ls_p-s_amt + ( ls_p-s_gst_amt ).
  gs_currencyamount-amt_base   = ls_p-s_amt + ( ls_p-s_gst_amt ).
  APPEND gs_currencyamount TO gt_currencyamount.
  CLEAR gs_currencyamount.

  " ── Vendor Payable / Customer Receivable line ──────────────────
  gv_itemno = gv_itemno + 1.
  gs_accountpayable-itemno_acc    = gv_itemno.
  gs_accountpayable-vendor_no     = |{ ls_p-ap2_vendor ALPHA = IN }|.
  gs_accountpayable-item_text     = ls_p-ap2_item_text.
  gs_accountpayable-bus_area      = ls_p-ap2_ba.
  gs_accountpayable-businessplace = ls_p-ap2_bplace.
  gs_accountpayable-sectioncode   = ls_p-ap2_sec_code.
  gs_accountpayable-tax_code = ls_p-ap2_tax_code.
  APPEND gs_accountpayable TO gt_accountpayable.
  CLEAR gs_accountpayable.

  " ── Currency Amount for Vendor/Customer line ───────────────────
  gs_currencyamount-itemno_acc   = gv_itemno.
  gs_currencyamount-currency     = ls_p-s_curr.
  gs_currencyamount-currency_iso = ls_p-s_curr.
  gs_currencyamount-amt_doccur = ( ls_p-s_amt + ( ls_p-s_gst_amt  ) ) * ( -1 ).
  gs_currencyamount-amt_base   = ( ls_p-s_amt + ( ls_p-s_gst_amt  ) ) * ( -1 ).
  APPEND gs_currencyamount TO gt_currencyamount.
  CLEAR gs_currencyamount.

  " ── Withholding Tax (TDS) ──────────────────────────────────────
  IF ls_p-wt3_has_tds = 'X' AND ls_p-wt3_code IS NOT INITIAL.
    gv_itemno = gv_itemno + 1.
    gs_accountwt-itemno_acc  = gv_itemno.
    gs_accountwt-wt_type     = ls_p-wt3_type.
    gs_accountwt-wt_code     = ls_p-wt3_code.
    gs_accountwt-bas_amt_tc  = ls_p-s_amt.
    gs_accountwt-bas_amt_lc  = ls_p-s_amt.
    gs_accountwt-man_amt_tc  = CONV bseg-wrbtr( ls_p-wt3_man_amt_tc ).
    gs_accountwt-man_amt_lc  = CONV bseg-wrbtr( ls_p-wt3_man_amt_tc ).
    gs_accountwt-bas_amt_ind = abap_true.
    gs_accountwt-man_amt_ind = abap_true.
    APPEND gs_accountwt TO gt_accountwt.
    CLEAR gs_accountwt.
  ENDIF.

  " ── Post via BAPI ──────────────────────────────────────────────
  PERFORM bapi_post.

  " ── Handle result ──────────────────────────────────────────────
  READ TABLE gt_return INTO gs_return WITH KEY type = 'S'.
  IF sy-subrc = 0.

    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = abap_true.

    lv_doc = gv_obj_key+0(10).
    lv_doc = |{ lv_doc ALPHA = OUT }|.

    PERFORM save_data_zfiv USING lv_doc ls_p.

    " Rebuild parked IDs for HTML reload
    lv_pid_nl = cl_abap_char_utilities=>newline.
    SELECT snro
      FROM zfs_ps_t004
      WHERE status = '02'
        AND snro IS NOT INITIAL
      INTO TABLE @DATA(lt_parked_ids).

    LOOP AT lt_parked_ids ASSIGNING FIELD-SYMBOL(<fs_pid>).
      lv_pid_items = lv_pid_items && lv_pid_sep && lv_pid_nl
                  && |"{ <fs_pid>-snro }"|.
      lv_pid_sep = ','.
    ENDLOOP.

    gv_parked_ids = |[{ lv_pid_items }{ lv_pid_nl }]|.

*    gv_park_docno = lv_doc.
*    MESSAGE s001 WITH lv_doc.
*    lcl_html_display=>display_html( '' ).

  ELSE.

    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.

    LOOP AT gt_return INTO gs_return
      WHERE type = 'E' OR type = 'A'.
      IF lv_err IS INITIAL.
        lv_err = gs_return-message.
      ELSE.
        lv_err = lv_err && ' | ' && gs_return-message.
      ENDIF.
    ENDLOOP.

    REPLACE ALL OCCURRENCES OF '"'  IN lv_err WITH ' '.
    REPLACE ALL OCCURRENCES OF '''' IN lv_err WITH ' '.

    gv_park_error = lv_err.
    lcl_html_display=>display_html( '' ).

  ENDIF.
  "<-- Test
ENDFORM.



*&---------------------------------------------------------------------*
*& Form BAPI_POST
*&---------------------------------------------------------------------*
FORM bapi_post.
  CALL FUNCTION 'BAPI_ACC_DOCUMENT_POST'
    EXPORTING
      documentheader    = gs_documentheader
    IMPORTING
      obj_type          = gv_obj_type
      obj_key           = gv_obj_key
      obj_sys           = gv_obj_sys
    TABLES
      accountgl         = gt_accountgl
      accountreceivable = gt_accountreceivable
      accountpayable    = gt_accountpayable
*     accounttax        = gt_accounttax   " commented — auto calc applied -" uc - ps
      currencyamount    = gt_currencyamount
      extension1        = gt_extension1
      return            = gt_return
      accountwt         = gt_accountwt.
ENDFORM.


*&---------------------------------------------------------------------*
*& Form SAVE_DATA_ZFIV
*& Mirrors reference FORM save_data.
*&---------------------------------------------------------------------*
FORM save_data_zfiv
  USING pv_doc TYPE belnr_d
        ls_p   TYPE ty_params.

  DATA: lst004 TYPE zfs_ps_t004.

  SELECT SINGLE * FROM zfs_ps_t004
    INTO CORRESPONDING FIELDS OF @lst004
    WHERE snro = @ls_p-upl_id .

  lst004-bukrs          = ls_p-hd_comp_code.
  lst004-vendor         = |{ ls_p-ap2_vendor ALPHA = IN }|.
  lst004-belnr          = pv_doc.
  lst004-p_date         = ls_p-hd_pstng_date.
  lst004-kostl          = |{ ls_p-gl1_cc ALPHA = IN }|.
  lst004-status          = '02'. " Parked

  MODIFY zfs_ps_t004 FROM lst004.
  IF sy-subrc = 0.
    COMMIT WORK AND WAIT.
  ENDIF.
  CLEAR lst004.

ENDFORM.
*&---------------------------------------------------------------------*
*& Form dms_upload
*& uploading the document into the system
*&---------------------------------------------------------------------*
*& -->  p1        text
*& <--  p2        text
*&---------------------------------------------------------------------*
FORM dms_upload .
  CLEAR: ls_documentdata, lw_files, lt_files.
  lv_source_path = lv_file_path.
  gv_fname = lv_source_path.
  out_dms-zsource_path = lv_source_path.
  out_dms-zdoc_type = 'TRM'.

*  gs_t018-zdoc_range = '01'.
*  gs_t018-zdoc_obj = 'ZFS_LMS02'.

* Getting next no in sequence
  CALL FUNCTION 'NUMBER_GET_NEXT'
    EXPORTING
      nr_range_nr             = '01'
      object                  = 'ZPS_NR01'
    IMPORTING
      number                  = out_dms-zdms_code
    EXCEPTIONS
      interval_not_found      = 1
      number_range_not_intern = 2
      object_not_found        = 3
      quantity_is_0           = 4
      quantity_is_not_1       = 5
      interval_overflow       = 6
      buffer_overflow         = 7
      OTHERS                  = 8.

  IF sy-subrc <> 0.
    MESSAGE 'Number Range Cannot be Generated' TYPE 'E' DISPLAY LIKE 'I'.
    LEAVE LIST-PROCESSING.
  ENDIF.

*    Splitting file and path
  CALL FUNCTION 'SO_SPLIT_FILE_AND_PATH'
    EXPORTING
      full_name     = lv_file_path
    IMPORTING
      stripped_name = gv_zdoc_name
      file_path     = gv_file_path.

  out_dms-zdoc_name = gv_zdoc_name.
  gv_zdoc_name = reverse( gv_zdoc_name ).
  SPLIT gv_zdoc_name AT '.' INTO out_dms-zdoc_extn gv_dummy.
  gv_zdoc_name = reverse( gv_zdoc_name ).
  out_dms-zdoc_extn = reverse( out_dms-zdoc_extn ).
  TRANSLATE out_dms-zdoc_extn TO UPPER CASE. "convert extension to upper case

*    Get File Info
  CALL FUNCTION 'GUI_GET_FILE_INFO'
    EXPORTING
      fname          = gv_fname
    IMPORTING
      file_size      = gv_size
    EXCEPTIONS
      fileinfo_error = 1
      OTHERS         = 2.
  IF sy-subrc <> 0.
* Implement suitable error handling here
  ENDIF.

  CLEAR: lv_kb,lv_mb.
  TRY. lv_kb = gv_size / 1024. CATCH cx_sy_arithmetic_error. ENDTRY.
  TRY. lv_mb = lv_kb / 1024. CATCH cx_sy_arithmetic_error. ENDTRY.

  IF lv_mb < 1.
    out_dms-zfile_size = lv_kb.
    out_dms-zsize_byte = c_kb.
  ELSE.
    out_dms-zfile_size = lv_mb.
    out_dms-zsize_byte = c_mb.
  ENDIF.

  CONDENSE out_dms-zfile_size.
  CONDENSE out_dms-zsize_byte.

  ls_documentdata-documenttype = 'TRM'.
  ls_documentdata-documentversion = '00'.
  ls_documentdata-documentpart = '000'.

  gv_doctype_cr = 'TRM'.
  IF out_dms-zdoc_desc IS INITIAL.
    ls_documentdata-description = out_dms-zdoc_name.
  ELSE.
    ls_documentdata-description = out_dms-zdoc_desc.
  ENDIF.
  ls_documentdata-description = lv_source_path.
  ls_documentdata-username = sy-uname. "User name
  ls_documentdata-statusextern = 'FR'.
  ls_documentdata-docfile1 = lv_file_path.
  ls_documentdata-laboratory = '001'.

*    Added for testing

  lw_files-documenttype = 'TRM'.
  lw_files-documentpart = '000'.
  lw_files-documentversion = '00'.
  lw_files-wsapplication = 'TRM'.
*  lw_files-docpath = in_dms-zsource_path.
  lw_files-docpath = gv_file_path.
  lw_files-docfile = out_dms-zdoc_name.
  lw_files-description = 'TEST'."out_dms-zdoc_desc.
  lw_files-storagecategory = 'DMS_C1_ST'.
  APPEND lw_files TO lt_files.

*    Uploading the PDF Documents for the SLC data through CV01N tcode fucntionality
  CALL FUNCTION 'BAPI_DOCUMENT_CREATE2'
    EXPORTING
      documentdata    = ls_documentdata
    IMPORTING
      documenttype    = gv_doctype_cr
      documentnumber  = out_dms-zstd_dms
*     documentpart    =
      documentversion = out_dms-zversion
      return          = gs_return1
    TABLES
      documentfiles   = lt_files.

  IF gs_return1-type <> 'E'.
    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
      EXPORTING
        wait = 'X'.

*    gs_t003-zdate    = in_dms-zdate .
*    gs_t003-zdms_cat = in_dms-zdms_cat .
    gs_t003-zversion = out_dms-zversion .
    gs_t003-zdoc_type = 'TRM' .
*    gs_t003-zdtype = in_dms-zdtype .
    gs_t003-zstd_dms = out_dms-zstd_dms .
    gs_t003-zdms_code = out_dms-zdms_code .
    gs_t003-zdoc_name = out_dms-zdoc_name .
    gs_t003-zdoc_extn = out_dms-zdoc_extn .
    gs_t003-zdoc_desc = 'Test File' .
    gs_t003-zsource_path = lv_file_path.
    gs_t003-zfile_size = out_dms-zfile_size .
    gs_t003-zsize_byte = out_dms-zsize_byte .
    gs_t003-zcreated_by   = out_dms-zcreated_by   = sy-uname.
    gs_t003-zcreated_date = out_dms-zcreated_date = sy-datum.
    gs_t003-zcreated_time = out_dms-zcreated_time = sy-uzeit.

*Modifying DMS Custom Table
    MODIFY zfs_ps_t003 FROM gs_t003.
    IF sy-subrc = 0.
      COMMIT WORK AND WAIT.
    ENDIF.

    IF gv_flag_bulk <> 'X'.
      MESSAGE 'Document Uploaded Successfully' TYPE 'I' DISPLAY LIKE 'S'.
    ENDIF.

    CLEAR: gs_t003.

  ELSE.

    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
  ENDIF.

ENDFORM.
*&---------------------------------------------------------------------*
*& Form dms_new
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
*& -->  p1        text
*& <--  p2        text
*&---------------------------------------------------------------------*
FORM dms_new USING p_file ls_p TYPE ty_params. .
  CONSTANTS: c_wt           TYPE string VALUE 'Please Select Folder',
             c_dctyp        TYPE char3 VALUE 'TRM',
             c_dcprt        TYPE doktl_d VALUE '000',
             c_dcvrsn       TYPE dokvr VALUE '00',
             c_e(1)         VALUE 'E',
             c_dsx(3)       VALUE 'DSX',
             c_03(2)        VALUE '03',
             c_04(2)        VALUE '04',
             c_doc(3)       VALUE 'doc',
             c_wwi(3)       VALUE 'WWI',
             c_kb(2)        VALUE 'KB',
             c_mb(2)        VALUE 'MB',
             c_00(2)        VALUE '00',
             c_000(3)       VALUE '000',
             c_fr(2)        VALUE 'D1',
             c_001(3)       VALUE '001',
             c_window_title TYPE string VALUE 'Select File For Uploading',
             c_stcat        TYPE cv_storage_cat VALUE 'DMS_C1_ST'.

  DATA: lt_files         TYPE TABLE OF bapi_doc_files2,
        lw_files         TYPE bapi_doc_files2,
        ls_documentdata  TYPE bapi_doc_draw2,
        ls_documentdatax TYPE bapi_doc_drawx2,
        lv_dctyp         TYPE dokar,
        lv_docnr         TYPE doknr,
        lv_docpr         TYPE doktl_d,
        lv_docvr         TYPE dokvr,
        ls_ret           TYPE bapiret2,
        " lv_msg(120) TYPE c,
        wsapp            TYPE dappl,
        lv_size          TYPE i,
        lv_source_path   TYPE rlgrap-filename,
        lv_mb            TYPE p DECIMALS 2,
        lv_kb            TYPE p DECIMALS 2.

  DATA lv_access_ok TYPE abap_bool.

  DATA: gv_stripped_name TYPE string,
        gv_file_path     TYPE string,
        lv_dummy         TYPE string,
        gv_extn          TYPE char30.

  DATA: gv_dms_code TYPE bapi_doc_aux-docnumber,
        gv_path     TYPE string.

  DATA: lv_fullpath TYPE string,
        lv_path     TYPE string,
        lv_filename TYPE string.
  DATA : lv_index TYPE sy-tabix.

  DATA is_parts    TYPE string.
  DATA it_parts   LIKE TABLE OF is_parts.

  CONSTANTS: c_x(1)    VALUE 'X',
             c_docx(4) VALUE 'docx',
             c_msg(3)  VALUE 'msg',
             c_eml(4)  VALUE 'eml.',
             c_trm(3)  VALUE 'TRM',
             c_jpg(3)  VALUE 'jpg',
             c_jpeg(4) VALUE 'jpeg',
             c_png(3)  VALUE 'png',
             c_csv(3)  VALUE 'csv'.

  DATA: lv_file_name_only TYPE string,
        lt_path_parts     TYPE TABLE OF string,
        lv_last_part      TYPE string.

  IF p_file IS INITIAL.
    MESSAGE 'File name is missing for DMS upload' TYPE 'S' DISPLAY LIKE 'E'.
    RETURN.
  ENDIF.

  lv_file_name_only = p_file.

  REPLACE ALL OCCURRENCES OF '\' IN lv_file_name_only WITH '/'.

  SPLIT lv_file_name_only AT '/' INTO TABLE lt_path_parts.

  READ TABLE lt_path_parts INTO lv_last_part INDEX lines( lt_path_parts ).

  IF lv_last_part IS NOT INITIAL.
    p_file = lv_last_part.
  ELSE.
    p_file = lv_file_name_only.
  ENDIF.

  "D:\VIM folder\90.Jan.26-Fourth Signal Pvt Ltd.pdf"
  gv_path = 'D:\VIM folder\' && p_file.
  lv_fullpath = gv_path.

  " Get file path manually
  SPLIT lv_fullpath AT '\' INTO TABLE it_parts.
  lv_index = lines( it_parts ).
  READ TABLE it_parts INDEX lv_index INTO lv_filename.

  DELETE it_parts INDEX lv_index.
  CONCATENATE LINES OF it_parts INTO lv_path SEPARATED BY '\'.
  CONCATENATE lv_path '\' INTO lv_path.

  gv_file_path = lv_path.
  gv_stripped_name = lv_filename.

  SPLIT gv_stripped_name AT '.' INTO lv_dummy gv_extn.
  TRANSLATE gv_extn TO LOWER CASE.

  IF gv_extn = c_doc .
    wsapp = c_wwi.
  ELSEIF gv_extn = c_docx OR gv_extn = c_msg OR gv_extn CS c_eml.
    wsapp = c_trm.
    gv_extn = c_msg.
    TRANSLATE gv_extn TO UPPER CASE.
  ELSEIF gv_extn = c_jpg . "jpg image
    wsapp = c_trm.
    gv_extn = c_jpg.
    TRANSLATE gv_extn TO UPPER CASE.
  ELSEIF gv_extn = c_jpeg . "jpeg image
    wsapp = c_trm.
    gv_extn = c_jpeg.
    TRANSLATE gv_extn TO UPPER CASE.
  ELSEIF gv_extn = c_png . "png image
    wsapp = c_trm.
    gv_extn = c_png.
    TRANSLATE gv_extn TO UPPER CASE.
  ELSEIF gv_extn = c_csv . "csv
    wsapp = c_trm.
    gv_extn = c_csv.
    TRANSLATE gv_extn TO UPPER CASE.
  ELSE.
    TRANSLATE gv_extn TO UPPER CASE.
    wsapp = gv_extn.
  ENDIF.



  ls_documentdata-documenttype = c_dctyp.
  ls_documentdata-documentversion = c_00.
  ls_documentdata-documentpart = c_000.
  ls_documentdata-description = gv_stripped_name.
  ls_documentdata-docfile1 = lv_fullpath.

  ls_documentdata-username = sy-uname. "User name
*  ls_documentdata-statusextern = c_fr.
  ls_documentdata-laboratory = c_001.

  lw_files-documenttype = c_dctyp.
  lw_files-documentpart = c_000.
  lw_files-documentversion = c_00.
  lw_files-wsapplication = 'TRM'.
  lw_files-docpath = lv_path .
  lw_files-docfile  =   gv_stripped_name.
  lw_files-storagecategory = c_stcat.
  APPEND lw_files TO lt_files.

  lv_dctyp = c_dctyp.
  lv_docpr = c_dcprt.
  lv_docvr = c_dcvrsn.



  OPEN DATASET lv_fullpath FOR INPUT IN BINARY MODE.

  IF sy-subrc = 0.
    lv_access_ok = abap_true.
    CLOSE DATASET lv_fullpath.
  ELSE.
    lv_access_ok = abap_false.
  ENDIF.

*  CALL FUNCTION 'BAPI_DOCUMENT_CREATE2'       "#EC CI_USAGE_OK[2438131]
*    EXPORTING
*      documentdata    = ls_documentdata
*    IMPORTING
*      documenttype    = lv_dctyp
*      documentnumber  = lv_docnr
*      documentpart    = lv_docpr
*      documentversion = lv_docvr
*      return          = ls_ret
*    TABLES
*      documentfiles   = lt_files.
*
*  CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
*    EXPORTING
*      wait = 'X'.

*  IF lv_docnr IS NOT INITIAL.

  DATA: ls_t004       TYPE zfs_ps_t004,
        lt_t004       TYPE TABLE OF zfs_ps_t004,
        lv_doc_no     TYPE char10,
        lv_line_count TYPE i.

  DATA: lv_json   TYPE string,
        lv_items  TYPE string,
        lv_record TYPE string,
        lv_sep    TYPE string,
        lv_nl     TYPE string.

  DATA: lt_parts TYPE TABLE OF string,
        ls_parts TYPE string.

  lv_nl = cl_abap_char_utilities=>newline.

  CALL FUNCTION 'NUMBER_GET_NEXT'
    EXPORTING
      nr_range_nr             = '01'
      object                  = 'ZPS_NR01'
    IMPORTING
      number                  = lv_doc_no
    EXCEPTIONS
      interval_not_found      = 1
      number_range_not_intern = 2
      object_not_found        = 3
      quantity_is_0           = 4
      quantity_is_not_1       = 5
      interval_overflow       = 6
      buffer_overflow         = 7
      OTHERS                  = 8.


  CLEAR ls_t004.
  ls_t004-bukrs          = ls_p-hd_comp_code.        " company code
  IF ls_t004-bukrs  IS INITIAL.
    ls_t004-bukrs  = '1000'.
  ENDIF.
  ls_t004-snro           = ls_p-upl_id.              " file ID
  ls_t004-doc_no         = lv_doc_no.                " generated number
  ls_t004-std_dms        = lv_docnr.                 " DMS doc number
  ls_t004-p_date         = ls_p-ocr_inv_date.        " invoice date YYYYMMDD
  ls_t004-vendor         = |{ ls_p-ocr_vendor_no ALPHA = IN }|.
  ls_t004-vendor_name    = ls_p-ocr_vendor.     " first 100 chars
  ls_t004-reference      = ls_p-ocr_inv_no.      " invoice number
  ls_t004-narration      = ls_p-ocr_vendor.     " vendor name as narration
  ls_t004-curr           = ls_p-ocr_currency.
  ls_t004-amt            = ls_p-ocr_total.           " total invoice amount
  ls_t004-gst_amt        = ls_p-ocr_tax.             " GST/tax amount
  ls_t004-v_amt          = ls_p-ocr_subtotal.        " subtotal/base amount
  ls_t004-status         = '01'.                     " Uploaded
  ls_t004-zcreated_by    = sy-uname.
  ls_t004-zcreated_date  = sy-datum.
  ls_t004-zcreated_time  = sy-uzeit.

  " ls_t004-vendor_gstin   = ls_p-ocr_vendor_gstin.
  " ls_t004-customer_gstin = ls_p-ocr_customer_gstin.

  MODIFY zfs_ps_t004 FROM ls_t004.
  IF sy-subrc = 0.
    COMMIT WORK AND WAIT.
  ENDIF.

*    PERFORM build_all_payloads.

*  ELSE.
*    MESSAGE 'Failed to upload data' TYPE 'S' DISPLAY LIKE 'E'.
*
*  ENDIF.

ENDFORM.
*&---------------------------------------------------------------------*
*& Form download_doc
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
*&      --> LV_STD_DMS
*&---------------------------------------------------------------------*
FORM download_doc  USING    p_lv_std_dms.

  DATA : lv_return        TYPE bapiret2,
         lt_documentfiles TYPE TABLE OF bapi_doc_files2.

  CALL FUNCTION 'BAPI_DOCUMENT_GETDETAIL2'
    EXPORTING
      documenttype       = 'TRM'
      documentnumber     = p_lv_std_dms
      documentpart       = '000'
      documentversion    = '00'
      getdocdescriptions = abap_true
      getdocfiles        = abap_true
    IMPORTING
      return             = lv_return
    TABLES
      documentfiles      = lt_documentfiles.


  CALL METHOD cl_gui_frontend_services=>directory_browse
    EXPORTING
      initial_folder       = 'D:\VIM folder\'
      window_title         = c_wt
    CHANGING
      selected_folder      = gv_down_path
    EXCEPTIONS
      cntl_error           = 1
      error_no_gui         = 2
      not_supported_by_gui = 3
      OTHERS               = 4.

  IF gv_down_path IS NOT INITIAL.
    CALL METHOD cl_gui_frontend_services=>directory_exist
      EXPORTING
        directory            = gv_down_path
      RECEIVING
        result               = gv_ans
      EXCEPTIONS
        cntl_error           = 1
        error_no_gui         = 2
        wrong_parameter      = 3
        not_supported_by_gui = 4
        OTHERS               = 5.

    IF gv_ans = abap_true.


      CLEAR : org_path, lt_documentfile.

      CONCATENATE gv_down_path '\' INTO org_path.

      DATA: lv_dms_code TYPE bapi_doc_aux-docnumber.
      lv_dms_code = p_lv_std_dms.

      DATA: ls_docfiles TYPE bapi_doc_files2.
      READ TABLE lt_documentfiles INTO ls_docfiles INDEX 1.

      CALL FUNCTION 'BAPI_DOCUMENT_CHECKOUTVIEW2'
        EXPORTING
          documenttype    = c_dctyp
          documentnumber  = lv_dms_code
*         documentnumber  = lt_dms_code
          documentpart    = c_dcprt
          documentversion = c_dcvrsn
          documentfile    = ls_docfiles
          originalpath    = org_path
        IMPORTING
          return          = lt_rtn
        TABLES
          documentfiles   = lt_documentfile_1.

      IF sy-subrc <> 0 OR lt_rtn-type = c_e.
*    MESSAGE lt_rtn-message TYPE 'I'.
        MESSAGE 'Documents Downloaded Successfully' TYPE 'S'.
      ENDIF. "sy-subrc <> 0 OR lt_rtn-type = c_e.

      CLEAR: lt_documentfile_1.

    ENDIF.
  ENDIF.
ENDFORM.













***"  DATA: lv_doc   TYPE belnr_d,
***        lv_amt   TYPE bseg-wrbtr,
***        lv_fyear TYPE c LENGTH 4.
***
***  " ── Clear all BAPI structures before use (same as reference) ──
***  CLEAR: gv_itemno,
***         gs_accountgl,    gt_accountgl,
***         gs_accountpayable, gt_accountpayable,
***         gs_accountreceivable, gt_accountreceivable,
***         gs_accounttax,   gt_accounttax,
***         gs_accountwt,    gt_accountwt,
***         gs_currencyamount, gt_currencyamount,
***         gs_documentheader, gt_return.
***
***  " ── Document Header ──────────────────────────────────────────────
***  gs_documentheader-comp_code  = ls_p-hd_comp_code.
***  gs_documentheader-doc_date   = ls_p-hd_doc_date.
***  gs_documentheader-doc_type   = 'KR'.
***  gs_documentheader-pstng_date = ls_p-hd_pstng_date.
***  gs_documentheader-ref_doc_no = ls_p-hd_ref_doc_no.
***  gs_documentheader-header_txt = ls_p-hd_header_txt.
***  gs_documentheader-doc_status = '2'.     " Park document
***
***  " Get fiscal year (same FM + variant as reference)
***  CALL FUNCTION 'GM_GET_FISCAL_YEAR'
***    EXPORTING
***      i_date = ls_p-hd_pstng_date
***      i_fyv  = 'V3'
***    IMPORTING
***      e_fy   = lv_fyear.
***
***  gs_documentheader-fisc_year = lv_fyear - 1.
***  gs_documentheader-username  = sy-uname.
***
***  " ── GL Line Item (Expense / Prepayment GL) ───────────────────────
***  " HTML sends single GL line as gl1_* params.
***  " If you later support multi-GL, loop here same as reference.
***  gv_itemno = gv_itemno + 1.
***  gs_accountgl-itemno_acc = gv_itemno.
***
***  " Prepayment GL override (mirrors gs_screen-prp logic)
***  IF ls_p-hd_header_txt = '02' AND ls_p-gl1_account IS INITIAL.
***    " Prepayment: GL comes from config — already resolved in HTML
***    " and sent as gl1_account. If blank, fetch from /FSPL/FI_T016.
***    SELECT SINGLE zpgl
***      FROM /fspl/fi_t016
***      INTO @gs_accountgl-gl_account
***      WHERE zbukrs = @ls_p-hd_comp_code.
***  ELSE.
***    gs_accountgl-gl_account = |{ ls_p-gl1_account ALPHA = IN }|.
***  ENDIF.
***
***  gs_accountgl-costcenter = |{ ls_p-gl1_cc ALPHA = IN }|.
***  gs_accountgl-bus_area   = ls_p-gl1_ba.
***
***  CASE ls_p-hd_header_txt.
***    WHEN '01' OR '02'.
***      gs_accountgl-tax_code = ls_p-gl1_tax_code.
***  ENDCASE.
***
***  APPEND gs_accountgl TO gt_accountgl.
***  CLEAR gs_accountgl.
***
***  " ── Currency Amount for GL line ──────────────────────────────────
***  " ABAP recalculates GST using CALCULATE_TAX_FROM_NET_AMOUNT
***  " for accuracy (same as reference FORM park_document)
***  gs_currencyamount-itemno_acc   = gv_itemno.
***  gs_currencyamount-currency     = ls_p-gl1_curr.
***  gs_currencyamount-currency_iso = ls_p-gl1_curr.
***
***  DATA(lv_gl_amt) = CONV bseg-wrbtr( ls_p-gl1_amt_doccur ).
***  DATA(lv_gst_amt_bapi) = CONV bseg-wrbtr( 0 ).
***
***  IF ls_p-s_gst_code IS NOT INITIAL.
***    CLEAR gt_taxamt.
***    CALL FUNCTION 'CALCULATE_TAX_FROM_NET_AMOUNT'
***      EXPORTING
***        i_bukrs = ls_p-hd_comp_code
***        i_mwskz = ls_p-s_gst_code
***        i_waers = ls_p-s_curr
***        i_wrbtr = lv_gl_amt
***      IMPORTING
***        e_fwnvv = gv_fwste
***      TABLES
***        t_mwdat = gt_taxamt
***      EXCEPTIONS
***        OTHERS  = 15.
***
***    lv_gst_amt_bapi = REDUCE bseg-wrbtr(
***      INIT s TYPE bseg-wrbtr
***      FOR  wa IN gt_taxamt
***      NEXT s = s + wa-wmwst ).
***  ENDIF.
***
***  CASE ls_p-hd_header_txt.
***    WHEN '01' OR '02'.
***      gs_currencyamount-amt_doccur = lv_gl_amt + lv_gst_amt_bapi.
***      gs_currencyamount-amt_base   = lv_gl_amt + lv_gst_amt_bapi.
***    WHEN OTHERS.
***      gs_currencyamount-amt_doccur = lv_gl_amt.
***      gs_currencyamount-amt_base   = lv_gl_amt.
***  ENDCASE.
***
***  APPEND gs_currencyamount TO gt_currencyamount.
***  CLEAR gs_currencyamount.
***
***  " ── Vendor Payable Line ──────────────────────────────────────────
***  " Type 02 would be receivable — keeping structure same as reference.
***  CASE ls_p-hd_header_txt.
***    WHEN '02'.
***      " Prepayment against customer (receivable)
***      gv_itemno = gv_itemno + 1.
***      gs_accountreceivable-itemno_acc   = gv_itemno.
***      gs_accountreceivable-customer     = ls_p-ap2_vendor.
***      gs_accountreceivable-item_text    = ls_p-ap2_item_text.
***      gs_accountreceivable-bus_area     = ls_p-ap2_ba.
***      gs_accountreceivable-businessplace = ls_p-ap2_bplace.
***      gs_accountreceivable-sectioncode  = ls_p-ap2_sec_code.
***      gs_accountreceivable-tax_code     = ls_p-ap2_tax_code.
***      APPEND gs_accountreceivable TO gt_accountreceivable.
***      CLEAR gs_accountreceivable.
***    WHEN OTHERS.
***      " Normal vendor payable
***      gv_itemno = gv_itemno + 1.
***      gs_accountpayable-itemno_acc   = gv_itemno.
***      gs_accountpayable-vendor_no    = |{ ls_p-ap2_vendor ALPHA = IN }|.
***      gs_accountpayable-item_text    = ls_p-ap2_item_text.
***      gs_accountpayable-bus_area     = ls_p-ap2_ba.
***      gs_accountpayable-businessplace = ls_p-ap2_bplace.
***      gs_accountpayable-sectioncode  = ls_p-ap2_sec_code.
***      CASE ls_p-hd_header_txt.
***        WHEN '01' OR '02'.
***          gs_accountpayable-tax_code = ls_p-ap2_tax_code.
***      ENDCASE.
***      APPEND gs_accountpayable TO gt_accountpayable.
***      CLEAR gs_accountpayable.
***  ENDCASE.
***
***  " ── Currency Amount for Vendor/Customer line ─────────────────────
***  gs_currencyamount-itemno_acc   = gv_itemno.
***  gs_currencyamount-currency     = ls_p-s_curr.
***  gs_currencyamount-currency_iso = ls_p-s_curr.
***
***  DATA(lv_base_amt) = CONV bseg-wrbtr( ls_p-s_amt ).
***
***  CASE ls_p-hd_header_txt.
***    WHEN '01' OR '02'.
***      gs_currencyamount-amt_doccur =
***        ( lv_base_amt + lv_gst_amt_bapi ) * ( -1 ).
***      gs_currencyamount-amt_base   =
***        ( lv_base_amt + lv_gst_amt_bapi ) * ( -1 ).
***    WHEN OTHERS.
***      gs_currencyamount-amt_doccur = lv_base_amt * ( -1 ).
***      gs_currencyamount-amt_base   = lv_base_amt * ( -1 ).
***  ENDCASE.
***
***  APPEND gs_currencyamount TO gt_currencyamount.
***  CLEAR gs_currencyamount.
***
***  " ── Withholding Tax (TDS) line ───────────────────────────────────
***  " Only added when TDS rate is present (mirrors gs_screen-tds_rate check)
***  IF ls_p-wt3_has_tds = 'X' AND ls_p-wt3_code IS NOT INITIAL.
***    gv_itemno = gv_itemno + 1.
***    gs_accountwt-itemno_acc  = gv_itemno.
***    gs_accountwt-wt_type     = ls_p-wt3_type.
***    gs_accountwt-wt_code     = ls_p-wt3_code.
***    gs_accountwt-bas_amt_tc  = lv_base_amt.   " added same as reference
***    gs_accountwt-man_amt_tc  = CONV bseg-wrbtr( ls_p-wt3_man_amt_tc ).
***    gs_accountwt-man_amt_lc  = CONV bseg-wrbtr( ls_p-wt3_man_amt_tc ).
***    gs_accountwt-bas_amt_ind = abap_true.
***    gs_accountwt-man_amt_ind = abap_true.
***    APPEND gs_accountwt TO gt_accountwt.
***    CLEAR gs_accountwt.
***  ENDIF.
***
***  " ── Post via BAPI (same PERFORM pattern as reference) ────────────
***  PERFORM bapi_post.
***
***  " ── Handle result ────────────────────────────────────────────────
***  READ TABLE gt_return INTO gs_return WITH KEY type = 'S'.
***  IF sy-subrc = 0.
***
***    CALL FUNCTION 'BAPI_TRANSACTION_COMMIT'
***      EXPORTING
***        wait = abap_true.
***
***    lv_doc = gv_obj_key+0(10).
***    lv_doc = |{ lv_doc ALPHA = OUT }|.
***
***    " Save transaction data to /FSPL/FI_T015 (same as reference save_data)
***    PERFORM save_data_zfiv USING lv_doc ls_p.
***
***    " Store doc number in global → reload HTML → applyResults() fires
***    gv_park_docno = lv_doc.
***    lcl_html_display=>display_html( '' ).
***
***    MESSAGE s001 WITH lv_doc.
***
***  ELSE.
***
***    CALL FUNCTION 'BAPI_TRANSACTION_ROLLBACK'.
***
***    " Collect error messages
***    DATA lv_err TYPE string.
***    LOOP AT gt_return INTO gs_return
***      WHERE type = 'E' OR type = 'A'.
***      IF lv_err IS INITIAL.
***        lv_err = gs_return-message.
***      ELSE.
***        lv_err = lv_err && ' | ' && gs_return-message.
***      ENDIF.
***    ENDLOOP.
***
***    " Sanitise for safe HTML injection
***    REPLACE ALL OCCURRENCES OF '"'  IN lv_err WITH ' '.
***    REPLACE ALL OCCURRENCES OF '''' IN lv_err WITH ' '.
***
***    gv_park_error = lv_err.
***    lcl_html_display=>display_html( '' ).
***
***  ENDIF.