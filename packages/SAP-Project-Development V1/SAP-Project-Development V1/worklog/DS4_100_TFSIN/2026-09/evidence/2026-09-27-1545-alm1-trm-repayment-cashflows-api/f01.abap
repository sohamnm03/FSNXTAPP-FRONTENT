*&---------------------------------------------------------------------*
*& Include          /FS00/ALMR003_F01
*&---------------------------------------------------------------------*
*&---------------------------------------------------------------------*
*& Form sub_get_layout
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
*& -->  p1        text
*& <--  p2        text
*&---------------------------------------------------------------------*
FORM sub_get_layout .
  gs_variant-report   = sy-repid.

  "FM to get ALV Variant
  CALL FUNCTION 'REUSE_ALV_VARIANT_F4'
    EXPORTING
      is_variant    = gs_variant
    IMPORTING
      es_variant    = gs_variant
    EXCEPTIONS
      not_found     = 1
      program_error = 2
      OTHERS        = 3.
  IF sy-subrc = 0.
    p_layout = gs_variant-variant.
  ENDIF.
ENDFORM.
*&---------------------------------------------------------------------*
*& Form get_data
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
*& -->  p1        text
*& <--  p2        text
*&---------------------------------------------------------------------*
FORM get_data .

  DATA: lv_type TYPE c LENGTH 3,
        lv_date TYPE dats.

  IF rb1 IS NOT INITIAL .
    gv_div =  10000000.
  ELSEIF rb2 IS NOT INITIAL.
    gv_div =  100000 .
  ELSEIF rb3 IS NOT INITIAL.
    gv_div =  1000.
  ENDIF.

  gt_int = VALUE #( sign = 'I' option = 'EQ' ( low  = '10' ) ( low = '12' ) ).
  gt_pri = VALUE #( sign = 'I' option = 'EQ' ( low  = '09' ) ( low = '11' ) ).

  lv_date = p_year && p_mon && '01'.

  CALL FUNCTION 'RP_LAST_DAY_OF_MONTHS'
    EXPORTING
      day_in            = lv_date
    IMPORTING
      last_day_of_month = lv_date.

  lv_date = lv_date + 1.

  "" Bucketing Data
  CALL FUNCTION '/FS00/ALMFM001'
    EXPORTING
      im_type = '01'
      im_date = lv_date
    IMPORTING
      ex_buck = gt_buck.

  "" CF Data
  SELECT  a~os_guid,
          a~bustranscat,
          a~trldate,
          a~bustransid,
          a~booking_state,
          a~flowtype,
          a~dis_flowtypetext,
          a~zfs_flow,
          a~units,
          a~nominal_amt,
          a~nominal_curr,
          a~position_amt,
          a~position_curr,
          a~valuation_amt,
          a~valuation_curr,
          a~valuation_area,
          a~valuation_class,
          a~company_code,
          a~product_type,
          a~security_id,
          a~deal_number,
          b~zs_type,
          b~zs_desc
    FROM /fs00/cds0002 AS a
    INNER JOIN /fs00/almtr009 AS b
    ON b~zflow  = a~flowtype AND b~zsgsart = a~product_type
    AND a~trldate >= @lv_date
    AND a~valuation_area = '001'
    WHERE  a~product_type IN @s_prd
    INTO CORRESPONDING FIELDS OF TABLE @gt_cf.
  SORT gt_cf BY company_code deal_number security_id zs_type.

  "" Transaction Data MM
  SELECT a~*
    FROM /fs00/cds0001 AS a
    FOR ALL ENTRIES IN @gt_cf
    WHERE bukrs = @p_bukrs
    AND ( rfha = @gt_cf-deal_number )
    INTO TABLE @DATA(lt_data_mm).

  "" Transaction Data Sec
  SELECT a~*
   FROM /fs00/cds0001 AS a
   FOR ALL ENTRIES IN @gt_cf
   WHERE bukrs = @p_bukrs
   AND ( ranl = @gt_cf-security_id )
   INTO TABLE @DATA(lt_data_sec) .

  DATA(lt_data) = lt_data_mm.
  DELETE lt_data_sec WHERE ranl IS INITIAL .
  SORT lt_data_sec BY bukrs ranl.
  DELETE ADJACENT DUPLICATES FROM lt_data_sec COMPARING bukrs ranl.
  lt_data = CORRESPONDING #( BASE ( lt_data ) lt_data_sec ).

  "" Money Market
  LOOP AT lt_data ASSIGNING FIELD-SYMBOL(<fs_data>).

    gs_data = CORRESPONDING #( <fs_data> ).
    SHIFT gs_data-bp_name LEFT DELETING LEADING '0'.

    IF gs_data-ranl IS INITIAL.
      "" Interest for MM
      PERFORM int_pri_mm  TABLES gt_int .

      "" Principal
      PERFORM int_pri_mm TABLES gt_pri.
    ELSE.
      gs_data-rfha = abap_false.
      "" Interest for MM
      PERFORM int_pri_sec  TABLES gt_int .

      "" Principal
      PERFORM int_pri_sec TABLES gt_pri.
    ENDIF.

  ENDLOOP.

ENDFORM.
*&---------------------------------------------------------------------*
*& Form display_data
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
*& -->  p1        text
*& <--  p2        text
*&---------------------------------------------------------------------*
FORM display_data .

  PERFORM fcat USING 'BUKRS' 'Co.Code'.
  PERFORM fcat USING 'RFHA' 'Transaction No'.
  PERFORM fcat USING 'RANL' 'Class ID'.
  PERFORM fcat USING 'ACTIVITY' 'Activity'.
  PERFORM fcat USING 'SGSART' 'Product Type'.
  PERFORM fcat USING 'LTX' 'Product Type Desc'.
  PERFORM fcat USING 'SFHAART' 'Txn Type'.
  PERFORM fcat USING 'XTEXT' 'Txn Type Desc'.
  PERFORM fcat USING 'KONTRH' 'Customer'.
  PERFORM fcat USING 'BP_NAME' 'Customer Name'.
  PERFORM fcat USING 'DBLFZ' 'Start Date'.
  PERFORM fcat USING 'DELFZ' 'End Date'.

  PERFORM fcat USING 'STYPE' 'Src Type'.
  PERFORM fcat USING 'SDESC' 'Src Desc'.
  PERFORM fcat USING 'DATE' 'Date'.
  PERFORM fcat USING 'B01' '01 to 07 Days'.
  PERFORM fcat USING 'B02' '08 to 14 Days'.
  PERFORM fcat USING 'B03' '15 Days to 01 Month'.
  PERFORM fcat USING 'B04' '01 to 03 Months'.
  PERFORM fcat USING 'B05' '03 to 06 Months'.
  PERFORM fcat USING 'TOT' 'Total'.

  IF gt_data IS NOT INITIAL.
    gs_layout-cwidth_opt = 'X'.
    gs_variant-report   = sy-repid.

*    "FM to display ALV
    CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY_LVC'
      EXPORTING
        i_callback_program      = sy-cprog
        i_callback_user_command = 'USR_CMD'
*       i_callback_pf_status_set = 'ZSTATUS'
        i_callback_top_of_page  = 'TOP_OF_PAGE'
        is_layout_lvc           = gs_layout
        it_fieldcat_lvc         = gt_fcat
        i_save                  = 'X'
        is_variant              = gs_variant
      TABLES
        t_outtab                = gt_data
      EXCEPTIONS
        program_error           = 1
        OTHERS                  = 2.
    IF sy-subrc <> 0.
* IMPLEMENT SUITABLE ERROR HANDLING HERE
    ENDIF.

  ELSE.
    MESSAGE i000.
  ENDIF.
ENDFORM.

*&---------------------------------------------------------------------*
*& Form FILL_FCAT
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
*&      --> P_
*&      --> P_
*&---------------------------------------------------------------------*
FORM fcat USING p_field p_name..
  gs_fcat-fieldname = p_field.
  gs_fcat-scrtext_l = p_name.
  CASE p_field.
    WHEN 'RFHA' OR 'KONTRH' OR 'RANL'.
      gs_fcat-edit_mask = '==ALPHA'.
      gs_fcat-hotspot = 'X'.
    WHEN  'B01' OR 'B02' OR 'B03' OR 'B04' OR 'B05'  .
      gs_fcat-emphasize = 'C410'.
      gs_fcat-no_zero = 'X'.
    WHEN 'TOT'.
      gs_fcat-emphasize = 'C510'.
      gs_fcat-no_zero = 'X'.
  ENDCASE.
  APPEND gs_fcat TO gt_fcat.
  CLEAR:gs_fcat.
ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  top-of-page
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
FORM top_of_page.
  DATA : lt_heading TYPE slis_t_listheader.
  SELECT SINGLE butxt FROM t001 INTO @DATA(lv_butxt) WHERE bukrs = @p_bukrs.
  lt_heading = VALUE slis_t_listheader(
    ( typ = 'H' info = |{ lv_butxt }| )
    ( typ = 'H' info = TEXT-007 )
    ( typ = 'S' key  = 'Month : ' info = |{ p_mon }| )
    ( typ = 'S' key  = 'Year : '  info = |{ p_year }| )
    ( typ = 'S' key  = COND #( WHEN rb1 EQ abap_true THEN 'Amount In Crores'
                               WHEN rb2 EQ abap_true THEN 'Amount In Lakhs'
                               WHEN rb3 EQ abap_true THEN 'Amount In Thousands'
                               WHEN rb4 EQ abap_true THEN 'Amount In INR' ) )
                               ).
  CALL FUNCTION 'REUSE_ALV_COMMENTARY_WRITE'
    EXPORTING
      it_list_commentary = lt_heading[].
ENDFORM.                    "top_of_page
FORM usr_cmd USING r_ucomm LIKE sy-ucomm rs_selfield TYPE slis_selfield.

  CLEAR: gs_data.
  READ TABLE gt_data INTO gs_data INDEX rs_selfield-tabindex.
  IF sy-subrc = 0.
    CASE r_ucomm.
      WHEN '&IC1'.
        CASE rs_selfield-fieldname.
          WHEN 'RFHA'.
            CALL FUNCTION '/FS00/ALMFM002'
              EXPORTING
                iv_bukrs = p_bukrs
                iv_rfha  = gs_data-rfha.
          WHEN 'RANL'.
            CALL FUNCTION '/FS00/ALMFM002'
              EXPORTING
                iv_bukrs = p_bukrs
                iv_ranl  = gs_data-ranl.
        ENDCASE.
    ENDCASE.
  ENDIF.
ENDFORM.
*&---------------------------------------------------------------------*
*& Form Int_mm
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
*& -->  p1        text
*& <--  p2        text
*&---------------------------------------------------------------------*
FORM int_pri_mm TABLES p_code TYPE rt_int.

  DATA(lv_index) = line_index( gt_cf[ company_code = gs_data-bukrs deal_number = gs_data-rfha ] ).
  LOOP AT gt_cf ASSIGNING FIELD-SYMBOL(<fs_cf>) FROM lv_index WHERE zs_type IN p_code.
    IF <fs_cf>-company_code <> gs_data-bukrs OR <fs_cf>-deal_number <> gs_data-rfha.
      EXIT.
    ENDIF.
    gs_data-stype = <fs_cf>-zs_type.
    gs_data-sdesc = <fs_cf>-zs_desc.
    gs_data-date = <fs_cf>-trldate.
    LOOP AT gt_buck ASSIGNING FIELD-SYMBOL(<fs_buck>) WHERE ( zf_date <= <fs_cf>-trldate AND zt_date >= <fs_cf>-trldate ).
      CASE <fs_buck>-zbuc.
        WHEN '01'.
          gs_data-b01 = gs_data-b01 + <fs_cf>-position_amt.
        WHEN '02'.
          gs_data-b02 = gs_data-b02 + <fs_cf>-position_amt.
        WHEN '03'.
          gs_data-b03 = gs_data-b03 + <fs_cf>-position_amt.
        WHEN '04'.
          gs_data-b04 = gs_data-b04 + <fs_cf>-position_amt.
        WHEN '05'.
          gs_data-b05 = gs_data-b05 + <fs_cf>-position_amt.
      ENDCASE.
*          lv_type = 'B' && <fs_buck>-zbuc.
*          ASSIGN COMPONENT lv_type OF STRUCTURE gs_data TO FIELD-SYMBOL(<fs_val>).
*          IF sy-subrc = 0.
*            <fs_val> = <fs_val> + <fs_cf>-POSITION_amt.
*          ENDIF.
    ENDLOOP.
  ENDLOOP.

  gs_data-tot = gs_data-b01 + gs_data-b02 + gs_data-b03 + gs_data-b04 + gs_data-b05.
  IF gs_data-tot IS NOT INITIAL.

    IF gv_div IS NOT INITIAL.
      TRY.gs_data-b01 = gs_data-b01 / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
      TRY.gs_data-b02 = gs_data-b02 / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
      TRY.gs_data-b03 = gs_data-b03 / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
      TRY.gs_data-b04 = gs_data-b04 / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
      TRY.gs_data-b05 = gs_data-b05 / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
      TRY.gs_data-tot = gs_data-tot / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
    ENDIF.

    APPEND gs_data TO gt_data.
  ENDIF.

ENDFORM.

*&---------------------------------------------------------------------*
*& Form Int_mm
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
*& -->  p1        text
*& <--  p2        text
*&---------------------------------------------------------------------*
FORM int_pri_sec TABLES p_code TYPE rt_int.

  DATA(lv_index) = line_index( gt_cf[ company_code = gs_data-bukrs security_id = gs_data-ranl ] ).
  LOOP AT gt_cf ASSIGNING FIELD-SYMBOL(<fs_cf>) FROM lv_index WHERE zs_type IN p_code.
    IF <fs_cf>-company_code <> gs_data-bukrs OR <fs_cf>-security_id <> gs_data-ranl.
      EXIT.
    ENDIF.
    gs_data-stype = <fs_cf>-zs_type.
    gs_data-sdesc = <fs_cf>-zs_desc.
    gs_data-date = <fs_cf>-trldate.
    LOOP AT gt_buck ASSIGNING FIELD-SYMBOL(<fs_buck>) WHERE ( zf_date <= <fs_cf>-trldate AND zt_date >= <fs_cf>-trldate ).
      CASE <fs_buck>-zbuc.
        WHEN '01'.
          gs_data-b01 = gs_data-b01 + <fs_cf>-position_amt.
        WHEN '02'.
          gs_data-b02 = gs_data-b02 + <fs_cf>-position_amt.
        WHEN '03'.
          gs_data-b03 = gs_data-b03 + <fs_cf>-position_amt.
        WHEN '04'.
          gs_data-b04 = gs_data-b04 + <fs_cf>-position_amt.
        WHEN '05'.
          gs_data-b05 = gs_data-b05 + <fs_cf>-position_amt.
      ENDCASE.
*          lv_type = 'B' && <fs_buck>-zbuc.
*          ASSIGN COMPONENT lv_type OF STRUCTURE gs_data TO FIELD-SYMBOL(<fs_val>).
*          IF sy-subrc = 0.
*            <fs_val> = <fs_val> + <fs_cf>-POSITION_amt.
*          ENDIF.
    ENDLOOP.
  ENDLOOP.


  gs_data-tot = gs_data-b01 + gs_data-b02 + gs_data-b03 + gs_data-b04 + gs_data-b05.
  IF gs_data-tot IS NOT INITIAL.

    IF gv_div IS NOT INITIAL.
      TRY.gs_data-b01 = gs_data-b01 / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
      TRY.gs_data-b02 = gs_data-b02 / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
      TRY.gs_data-b03 = gs_data-b03 / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
      TRY.gs_data-b04 = gs_data-b04 / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
      TRY.gs_data-b05 = gs_data-b05 / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
      TRY.gs_data-tot = gs_data-tot / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
    ENDIF.

    APPEND gs_data TO gt_data.
  ENDIF.

ENDFORM.