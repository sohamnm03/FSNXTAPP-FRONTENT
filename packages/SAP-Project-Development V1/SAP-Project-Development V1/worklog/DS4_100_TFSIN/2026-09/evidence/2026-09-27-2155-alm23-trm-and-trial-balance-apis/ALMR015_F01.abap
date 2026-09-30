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

  DATA: lv_type  TYPE c LENGTH 3,
        lv_cdate TYPE c LENGTH 10,
        lv_date  TYPE dats.

  IF rb1 IS NOT INITIAL .
    gv_div =  10000000.
  ELSEIF rb2 IS NOT INITIAL.
    gv_div =  100000 .
  ELSEIF rb3 IS NOT INITIAL.
    gv_div =  1000.
  ENDIF.

  lv_date = p_year && |{ p_mon ALPHA = IN }| && '01'.
  gv_sdate = lv_date.
  CALL FUNCTION 'RP_LAST_DAY_OF_MONTHS'
    EXPORTING
      day_in            = lv_date
    IMPORTING
      last_day_of_month = lv_date.

  gv_date = lv_date.
  lv_date = lv_date + 1.

  "" Bucketing Data
  CALL FUNCTION '/FS00/ALMFM001'
    EXPORTING
      im_type = '02'
      im_date = lv_date
    IMPORTING
      ex_buck = gt_buck.

  PERFORM get_tpm12.

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
          a~fi_post_date
    FROM /fs00/cds0002 AS a
    WHERE  a~company_code = @p_bukrs
    AND a~product_type IN @rt_sgsart
    AND a~security_id IN @s_ranl
    AND a~deal_number IN @s_rfha
*    AND valuation_area = '001'
    INTO CORRESPONDING FIELDS OF TABLE @gt_cf.

  DELETE gt_cf WHERE booking_state = 4.
  DELETE gt_cf WHERE flowtype = 'MM1110-'.
  SORT gt_cf BY company_code deal_number security_id valuation_area zfs_flow trldate.

  SELECT *
    FROM /fs00/almtr026
    INTO TABLE @gt_/fs00/almtr026.

  "" Transaction Data MM
  SELECT a~*
    FROM /fs00/cds0001 AS a
    WHERE a~bukrs = @p_bukrs
    AND a~ranl IN @s_ranl
    AND a~rfha IN @s_rfha
    AND a~sgsart IN @rt_sgsart
    AND a~sfhaart IN @s_ttyp
    AND ( dblfz <= @gv_date AND delfz >= @gv_date  )
    INTO TABLE @DATA(lt_data_mm).
  SORT lt_data_mm BY bukrs rfha.

  "" Transaction Data Sec
  SELECT a~*
   FROM /fs00/cds0001 AS a
   WHERE a~bukrs = @p_bukrs
   AND a~ranl IN @s_ranl
   AND a~rfha IN @s_rfha
   AND a~sgsart IN @rt_sgsart
   AND a~sfhaart IN @s_ttyp
   AND ( dblfz <= @gv_date AND s_edate >= @gv_date )
   INTO TABLE @DATA(lt_data_sec) .

  DATA(lt_data) = lt_data_mm.
  DELETE lt_data_sec WHERE ranl IS INITIAL .
  SORT lt_data_sec BY bukrs ranl.
  DELETE ADJACENT DUPLICATES FROM lt_data_sec COMPARING bukrs ranl.
  lt_data = CORRESPONDING #( BASE ( lt_data ) lt_data_sec ).

  SELECT fcurr,
         tcurr,
         gdatu,
         ukurs FROM tcurr                               "#EC CI_GENBUFF
   INTO TABLE @DATA(lt_tcurr)
   FOR ALL ENTRIES IN @lt_data_mm
   WHERE kurst = 'TRMR'
   AND fcurr = @lt_data_mm-wgschft.
  LOOP AT lt_tcurr INTO DATA(gw_tcurr).
    WRITE gw_tcurr-gdatu TO lv_cdate.
    REPLACE ALL OCCURRENCES OF '.' IN lv_cdate WITH ''.
    CONCATENATE lv_cdate+4(4) lv_cdate+2(2) lv_cdate+0(2) INTO lv_cdate.
    gw_tcurr-gdatu = lv_cdate.
    MODIFY lt_tcurr FROM gw_tcurr TRANSPORTING gdatu.
  ENDLOOP.
  SORT lt_tcurr BY gdatu DESCENDING.

  "" Money Market
  LOOP AT lt_data ASSIGNING FIELD-SYMBOL(<fs_data>).

    gs_data = CORRESPONDING #( <fs_data> ).
    SHIFT gs_data-bp_name LEFT DELETING LEADING '0'.
    IF gs_data-ranl IS INITIAL.
      CASE gs_data-sgsart.
        WHEN '10E'.
          LOOP AT lt_tcurr ASSIGNING  FIELD-SYMBOL(<fs_tucrr>) WHERE gdatu <= gv_date AND fcurr = gs_data-wgschft AND tcurr = 'INR'.
            gs_data-rate = <fs_tucrr>-ukurs.
            EXIT.
          ENDLOOP.
      ENDCASE.

      IF gs_data-szsref IS INITIAL.
        gs_data-fvar = '01 - Fixed'.
      ELSE.
        gs_data-fvar = '02 - Variable'.
      ENDIF.

      "" Accrual for MM
      PERFORM pri_mm  USING gs_data-rate .
    ELSE.
      gs_data-rfha = abap_false.
      "" Accrual for Sec
      PERFORM pri_sec.
    ENDIF.
  ENDLOOP.
  DELETE gt_data WHERE sgsart EQ '10A'.
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
  PERFORM fcat USING 'SZSREF' 'Ref Int Rate'.
  PERFORM fcat USING 'FVAR' 'Fixed/Variable'.

  PERFORM fcat USING 'AMT' 'O/S Amt'.
  PERFORM fcat USING 'DATE' 'Repayment Date'.
  PERFORM fcat USING 'B01' '01 to 07 Days'.
  PERFORM fcat USING 'B02' '08 to 14 Days'.
  PERFORM fcat USING 'B03' '15 Days to 01 Month'.
  PERFORM fcat USING 'B04' '01 to 02 Months'.
  PERFORM fcat USING 'B05' '02 to 03 Months'.
  PERFORM fcat USING 'B06' '03 to 06 Months'.
  PERFORM fcat USING 'B07' '06 Months to 01 Year'.
  PERFORM fcat USING 'B08' '01 to 03 Years'.
  PERFORM fcat USING 'B09' '03 to 05 Years'.
  PERFORM fcat USING 'B10' 'Over 05 Years'.
  PERFORM fcat USING 'TOT' 'Total'.

  IF gt_data IS NOT INITIAL.
    gs_layout-cwidth_opt = 'X'.
    gs_variant-report   = sy-repid.

*    "FM to display ALV
    CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY_LVC'
      EXPORTING
        i_callback_program      = sy-cprog
        i_callback_user_command = 'USER_COMMAND'
*       i_callback_pf_status_set = 'ZSTATUS'
        i_callback_top_of_page  = 'TOP-OF-PAGE'
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
    WHEN  'B01' OR 'B02' OR 'B03' OR 'B04' OR 'B05' OR 'B06' OR 'B07' OR 'B08' OR 'B09' OR 'B10'  .
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
FORM top-of-page.

  DATA : lt_heading TYPE slis_t_listheader WITH HEADER LINE.

  SELECT SINGLE butxt
    FROM t001
    INTO @DATA(lv_comp_name)
    WHERE bukrs = @p_bukrs.

  lt_heading-typ = 'H'.
  lt_heading-info = lv_comp_name.
  APPEND lt_heading.
  CLEAR lt_heading.

  lt_heading-typ = 'H'.
  lt_heading-info = TEXT-007.
  APPEND lt_heading.
  CLEAR lt_heading.

  lt_heading-typ = 'S'.
  lt_heading-key = 'Month : '.
  lt_heading-info = p_mon.
  APPEND lt_heading.
  CLEAR lt_heading.

  lt_heading-typ = 'S'.
  lt_heading-key = 'Year : '.
  lt_heading-info = p_year.
  APPEND lt_heading.
  CLEAR lt_heading.

  IF rb1 IS NOT INITIAL.
    lt_heading-typ = 'S'.
    lt_heading-key = 'Amount In Crores'.
    APPEND lt_heading.
    CLEAR lt_heading.
  ELSEIF rb2 IS NOT INITIAL.
    lt_heading-typ = 'S'.
    lt_heading-key = 'Amount In Lakhs'.
    APPEND lt_heading.
    CLEAR lt_heading.
  ELSEIF rb3 IS NOT INITIAL.
    lt_heading-typ = 'S'.
    lt_heading-key = 'Amount In Thousands'.
    APPEND lt_heading.
    CLEAR lt_heading.
  ELSEIF rb4 IS NOT INITIAL.
    lt_heading-typ = 'S'.
    lt_heading-key = 'Amount In Inr'.
    APPEND lt_heading.
    CLEAR lt_heading.
  ENDIF.
  "eoc

  CALL FUNCTION 'REUSE_ALV_COMMENTARY_WRITE'
    EXPORTING
      it_list_commentary = lt_heading[].

  REFRESH lt_heading[].

ENDFORM.                    "top-of-page

FORM user_command USING r_ucomm LIKE sy-ucomm rs_selfield TYPE slis_selfield.

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
FORM pri_mm USING lv_rate.
  DATA: lv_days TYPE i,
        lv_flag TYPE c,
        lv_type TYPE c LENGTH 10.

  DATA: lv_buck TYPE string.
  DATA: lv_no TYPE c LENGTH 2.

  CLEAR:lv_flag.
  IF lv_rate IS INITIAL.
    CASE gs_data-sgsart.
      WHEN '10A'.
        LOOP AT gt_cf ASSIGNING FIELD-SYMBOL(<fs_cf>) WHERE   deal_number = gs_data-rfha AND ( trldate >= gv_date AND trldate <= gv_date ) AND valuation_area = '001'.
          CASE <fs_cf>-zfs_flow.
            WHEN 'FL01'.
              gs_data-amt += <fs_cf>-position_amt.
            WHEN 'FL03'.
              gs_data-amt -= <fs_cf>-position_amt.
            WHEN 'FL04'.
              gs_data-amt -= <fs_cf>-position_amt.
            WHEN 'FL11'.
              gs_data-amt += <fs_cf>-position_amt.
          ENDCASE.
        ENDLOOP.
        gs_data-date = gv_date + 1.
      WHEN OTHERS.
        LOOP AT gt_cf ASSIGNING <fs_cf> WHERE deal_number = gs_data-rfha AND trldate >= gv_date AND ( zfs_flow = 'FL03' OR zfs_flow = 'FL04' )
                                                        AND valuation_area = '001'.
          lv_days = <fs_cf>-trldate - gv_date. "" no of days
          LOOP AT gt_buck ASSIGNING FIELD-SYMBOL(<fs_buck>) WHERE ( zf_days <= lv_days AND zt_days >= lv_days ).
            lv_buck = |B{ <fs_buck>-zbuc }|.
            ASSIGN COMPONENT lv_buck OF STRUCTURE gs_data TO FIELD-SYMBOL(<fs_value>).
            IF sy-subrc = 0.
              <fs_value> += <fs_cf>-position_amt.
              EXIT.
            ENDIF.
          ENDLOOP.
        ENDLOOP.
        gs_data-tot = gs_data-b01 + gs_data-b02 + gs_data-b03 + gs_data-b04 + gs_data-b05 + gs_data-b06 + gs_data-b07 + gs_data-b08 + gs_data-b09 + gs_data-b10 .
        gs_data-amt = gs_data-tot.
        lv_flag = abap_true.
    ENDCASE.
  ELSE.
    READ TABLE gt_cf ASSIGNING <fs_cf> WITH KEY company_code = gs_data-bukrs deal_number = gs_data-rfha valuation_area = '001' zfs_flow = 'FL01'.
    IF sy-subrc = 0.
      gs_data-amt = <fs_cf>-nominal_amt * lv_rate.
      gs_data-date = gs_data-delfz.
    ENDIF.
  ENDIF.

  IF gs_data-amt IS NOT INITIAL.
    IF lv_flag IS INITIAL.
      gs_data-amt = abs( gs_data-amt ).
      lv_days = gs_data-date - gv_date. "" no of days
      LOOP AT gt_buck ASSIGNING <fs_buck> WHERE ( zf_days <= lv_days AND zt_days >= lv_days ).
        lv_type = 'B' && <fs_buck>-zbuc.
        gs_data-buck = <fs_buck>-zbuc.
        ASSIGN COMPONENT lv_type OF STRUCTURE gs_data TO FIELD-SYMBOL(<fs_val>).
        IF sy-subrc = 0.
          <fs_val> +=  gs_data-amt.
          EXIT.
        ENDIF.
      ENDLOOP.
    ENDIF.

    gs_data-tot = gs_data-b01 + gs_data-b02 + gs_data-b03 + gs_data-b04 + gs_data-b05 + gs_data-b06 + gs_data-b07 + gs_data-b08 + gs_data-b09 + gs_data-b10 .
    IF gs_data-tot IS NOT INITIAL.
      IF gv_div IS NOT INITIAL.
        DO 10 TIMES.
          lv_no = sy-index.
*          lv_buck = |B{ sy-index WIDTH = 2 PAD = '0' }|.
          ASSIGN COMPONENT |B{ lv_no ALPHA = IN }| OF STRUCTURE gs_data TO <fs_value>.
          IF sy-subrc = 0.
            TRY.<fs_value> /= gv_div.CATCH cx_sy_arithmetic_overflow. CLEAR <fs_val>. ENDTRY.
          ENDIF.
        ENDDO.
        "Total
        TRY.gs_data-amt /= gv_div. CATCH cx_sy_arithmetic_overflow.  ENDTRY.
        TRY.gs_data-tot /= gv_div. CATCH cx_sy_arithmetic_overflow.  ENDTRY.
      ENDIF.
      APPEND gs_data TO gt_data.
    ENDIF.
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
FORM pri_sec.

  DATA: lv_days TYPE i,
        lv_type TYPE c LENGTH 10.

  DATA: lv_no TYPE c LENGTH 2.

  DATA: lv_buck TYPE string.
  CASE gs_data-sgsart.
    WHEN '15D'.
      READ TABLE gt_cf ASSIGNING FIELD-SYMBOL(<fs_cf>) WITH KEY security_id = gs_data-ranl  valuation_area = '001' zfs_flow = 'FL04'.
      IF sy-subrc = 0.
        gs_data-amt -= <fs_cf>-position_amt.
      ENDIF.

      LOOP AT gt_cf ASSIGNING <fs_cf> WHERE security_id = gs_data-ranl AND trldate <= gv_date AND valuation_area = '001'
                                        AND ( zfs_flow = 'FL31' OR zfs_flow = 'FL51' OR zfs_flow = 'FL52' ) .
        CASE <fs_cf>-zfs_flow.
          WHEN 'FL31'.
            gs_data-amt += <fs_cf>-position_amt.
          WHEN 'FL51'.
            gs_data-amt += <fs_cf>-position_amt.
          WHEN 'FL52'.
            gs_data-amt -= <fs_cf>-position_amt.
        ENDCASE.
      ENDLOOP.

      LOOP AT gt_cf ASSIGNING <fs_cf> WHERE security_id = gs_data-ranl AND trldate <= gv_date AND valuation_area = '002'
                                       AND ( zfs_flow = 'FL51' OR zfs_flow = 'FL52' ) .
        CASE <fs_cf>-zfs_flow.
          WHEN 'FL51'.
            gs_data-amt -= <fs_cf>-position_amt.
          WHEN 'FL52'.
            gs_data-amt += <fs_cf>-position_amt.
        ENDCASE.
      ENDLOOP.
      gs_data-date = gs_data-s_edate.
    WHEN OTHERS.
      READ TABLE gt_/fs00/almtr026 ASSIGNING FIELD-SYMBOL(<fs_t026>) WITH KEY zprd_type = gs_data-sgsart.
      IF sy-subrc = 0.
        IF <fs_t026>-zprinc_tpm12 = abap_true.
          LOOP AT gt_tpm12 ASSIGNING FIELD-SYMBOL(<fs_tpm12>) WHERE company_code = gs_data-bukrs AND security_id = gs_data-ranl AND valuation_area = '001'.
            gs_data-amt += <fs_tpm12>-amaqu_val_pc .
            gs_data-date = <fs_tpm12>-mat_term_end.
          ENDLOOP.
        ENDIF.
      ENDIF.
  ENDCASE.

  IF gs_data-amt IS NOT INITIAL.
    gs_data-amt = abs( gs_data-amt ).
    lv_days = gs_data-date - gv_date. "" no of days
    LOOP AT gt_buck ASSIGNING FIELD-SYMBOL(<fs_buck>) WHERE ( zf_days <= lv_days AND zt_days >= lv_days ).
      lv_type = 'B' && <fs_buck>-zbuc.
      gs_data-buck = <fs_buck>-zbuc.
      ASSIGN COMPONENT lv_type OF STRUCTURE gs_data TO FIELD-SYMBOL(<fs_val>).
      IF sy-subrc = 0.
        <fs_val> +=  gs_data-amt.
      ENDIF.
    ENDLOOP.

    gs_data-tot = gs_data-b01 + gs_data-b02 + gs_data-b03 + gs_data-b04 + gs_data-b05 + gs_data-b06 + gs_data-b07 + gs_data-b08 + gs_data-b09 + gs_data-b10  .
    IF gs_data-tot IS NOT INITIAL.
      IF gv_div IS NOT INITIAL.
        DO 10 TIMES.
          lv_no = sy-index.
*          lv_buck = |B{ sy-index WIDTH = 2 PAD = '0' }|.
          ASSIGN COMPONENT |B{ lv_no ALPHA = IN }| OF STRUCTURE gs_data TO FIELD-SYMBOL(<fs_value>).
          IF sy-subrc = 0.
            TRY.<fs_value> /= gv_div.CATCH cx_sy_arithmetic_overflow. CLEAR <fs_val>. ENDTRY.
          ENDIF.
        ENDDO.
        "Total
        TRY.gs_data-amt /= gv_div. CATCH cx_sy_arithmetic_overflow.  ENDTRY.
        TRY.gs_data-tot /= gv_div. CATCH cx_sy_arithmetic_overflow.  ENDTRY.
      ENDIF.
      APPEND gs_data TO gt_data.
    ENDIF.
  ENDIF.

ENDFORM.
*&---------------------------------------------------------------------*
*& Form get_tpm12
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
*& -->  p1        text
*& <--  p2        text
*&---------------------------------------------------------------------*
FORM get_tpm12 .

  DATA: lv_sec TYPE c VALUE abap_true,
        lv_dea TYPE c VALUE abap_true.

*  IF s_rfha IS NOT INITIAL AND s_ranl IS INITIAL.
*    lv_sec = abap_false.
*  ELSEIF s_rfha IS INITIAL AND s_ranl IS NOT INITIAL.
*    lv_dea = abap_false.
*  ENDIF.

  SELECT 'I' AS sign,
         'EQ' AS option,
          zprd_type AS low
    FROM /fs00/almtr026
    INTO TABLE @rt_sgsart
    WHERE zprinc = @abap_true
    AND zprd_type IN @s_prd.

  SELECT 'I' AS sign,
       'EQ' AS option,
        zprd_type AS low
  FROM /fs00/almtr026
  INTO TABLE @rt_tpm12_prd
  WHERE zprinc_tpm12 = @abap_true
  AND zprd_type IN @s_prd.

  IF rt_tpm12_prd IS NOT INITIAL.
    cl_salv_bs_runtime_info=>set( EXPORTING display  = abap_false
                                            metadata = abap_false
                                            data     = abap_true ).

    SUBMIT rtpm_trl_show_position_values  WITH p_sec = lv_sec
                                          WITH p_dea = lv_dea
                                          WITH so_bukrs-low = p_bukrs
                                          WITH so_otcnr IN s_rfha
                                          WITH so_ranl IN s_ranl
                                          WITH pm_date = gv_date
                                          WITH so_pt IN rt_tpm12_prd
                                          WITH pm_noz  = 'X'
                                          WITH pm_pla  = 'X'
                       EXPORTING LIST TO MEMORY AND RETURN .

    TRY.
        cl_salv_bs_runtime_info=>get_data_ref( IMPORTING r_data = gt_dat ).
        ASSIGN gt_dat->* TO <fs_dat>.
        IF  <fs_dat> IS ASSIGNED.
          MOVE-CORRESPONDING <fs_dat> TO gt_tpm12.
          rt_rfha = VALUE #( FOR ls_data IN gt_tpm12 ( sign = 'I' option = 'EQ' low = ls_data-deal_number ) ).
          rt_ranl = VALUE #( FOR ls_data1 IN gt_tpm12 ( sign = 'I' option = 'EQ' low = ls_data1-security_id ) ).
        ENDIF.
      CATCH cx_salv_bs_sc_runtime_info.

    ENDTRY.
    cl_salv_bs_runtime_info=>clear_all( ).

    CALL METHOD cl_salv_bs_runtime_info=>set(
      EXPORTING
        display  = 'X'
        metadata = 'X'
        data     = 'X' ).
  ENDIF.
ENDFORM.
