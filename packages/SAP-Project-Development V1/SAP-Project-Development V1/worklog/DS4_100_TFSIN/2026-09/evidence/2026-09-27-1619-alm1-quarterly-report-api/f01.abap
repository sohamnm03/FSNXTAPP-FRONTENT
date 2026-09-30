*&---------------------------------------------------------------------*
*& Include          /FS00/ALMR008_F01
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

  DATA: lv_count TYPE i,
        lv_days  TYPE i,
        lv_fld   TYPE c LENGTH 6.

  PERFORM get_dates.

  "" beting Data
  CALL FUNCTION '/FS00/ALMFM001'
    EXPORTING
      im_type = '01'
      im_date = gv_sdate
    IMPORTING
      ex_buck = gt_buck.

  SELECT *
     FROM /fs00/almtr001
     INTO CORRESPONDING FIELDS OF TABLE gt_data.

  IF gt_data IS NOT INITIAL.
    SELECT *
      FROM /fs00/almtr011
      INTO TABLE @DATA(lt_t011)
      WHERE zbukrs = @p_bukrs
      AND zmonth = @p_mon
      AND zyear = @p_year.

    SELECT *
      FROM /fs00/almtr006
      INTO TABLE @DATA(lt_t006)
      WHERE zsrc <> ''.

    SELECT *
      FROM /fs00/almtr014
      INTO TABLE @DATA(lt_t014)
      WHERE zbukrs = @p_bukrs
      AND zmonth = @p_mon
      AND zyear = @p_year.

    SELECT *
      FROM /fs00/almtr013
      INTO TABLE @DATA(lt_t013)
      WHERE zeff_date <= @gv_sdate
      AND  zbukrs = @p_bukrs.
    SORT lt_t013 BY zeff_date zsrc zbukrs DESCENDING.
    DELETE ADJACENT DUPLICATES FROM lt_t013 COMPARING zeff_date zsrc zbukrs .

    SELECT *
      FROM /fs00/almtr010
      INTO TABLE @DATA(lt_t010)
      FOR ALL ENTRIES IN @lt_t006
      WHERE zbukrs = @p_bukrs
      AND zgrp_id = @lt_t006-zgrp_id
      AND zdate BETWEEN @gv_sdate AND @gv_edate.

    PERFORM fetch_trm_data.

    PERFORM update_xbrl.

    "" Interest Calc
    SORT gt_data BY zgrp_id.
    LOOP AT gt_data ASSIGNING <fs_data>.

      IF <fs_data>-zgrp_id = 'AA:99:99:99:99'.
        <fs_data>-color = 'C300'.
      ELSEIF <fs_data>-zgrp_id = 'AB:99:99:99:99'.
        <fs_data>-color = 'C300'.
      ELSEIF <fs_data>-zgrp_id = 'AA' OR <fs_data>-zgrp_id = 'AB'.
        <fs_data>-color = 'C700'.
      ENDIF.

      IF <fs_data>-zgrp_id+6(8) = '00:00:00'.    " Subtotal color
        <fs_data>-color = 'C100'.
      ENDIF.

      CASE <fs_data>-zgrp1.
        WHEN 'AC'.
          <fs_data>-color = 'C210'.
        WHEN 'AD'.
          <fs_data>-color = 'C100'.
        WHEN 'AE'.
          <fs_data>-color = 'C110'.
      ENDCASE.

      " Make Org Cover bold
      PERFORM cell_style..

      "" Color Logic
      PERFORM color_logic.

      <fs_data>-zxbrl = <fs_data>-zxbrl.

      CLEAR:rt_prd.
      CASE <fs_data>-zsrc.
        WHEN 09 OR 10 OR 11 OR 12. "" TRM
          "" Fetch the Prd Type from the GRP
          PERFORM fetch_product_type.
          LOOP AT gt_trm  INTO gs_trm WHERE sgsart IN rt_prd AND stype = <fs_data>-zsrc.
            <fs_data>-b01 +=  gs_trm-b01.
            <fs_data>-b02 += + gs_trm-b02.
            <fs_data>-b03 += + gs_trm-b03.
            <fs_data>-b04 += + gs_trm-b04.
            <fs_data>-b05 += + gs_trm-b05.
          ENDLOOP.
        WHEN 92.
          READ TABLE lt_t011 ASSIGNING FIELD-SYMBOL(<fs_t011>) WITH KEY zcode = <fs_data>-zgrp_id.
          IF sy-subrc = 0.
            <fs_data>-b01 += <fs_t011>-zbuc1.
            <fs_data>-b02 += <fs_t011>-zbuc2.
            <fs_data>-b03 += <fs_t011>-zbuc3.
            <fs_data>-b04 += <fs_t011>-zbuc4.
            <fs_data>-b05 += <fs_t011>-zbuc5.
          ENDIF.
        WHEN 71 OR 72 OR 73 OR 74 OR 75 OR 76 OR 77 OR 78 OR 79 OR 80 OR 85 OR
             23 OR 24 OR 25 OR 26 OR 27 OR 28 OR 29 OR 43 OR 44 OR 45 OR 46 OR
             47 OR 48 OR 49 OR 69 OR 70 OR 86 OR 87.
          "" Budget Data
          READ TABLE lt_t006 ASSIGNING FIELD-SYMBOL(<fs_t006>) WITH KEY zsrc =  <fs_data>-zsrc.
          IF sy-subrc = 0.
            CLEAR:lv_count.
            SORT lt_t010 BY zversion DESCENDING.
            LOOP AT lt_t010 ASSIGNING FIELD-SYMBOL(<fs_t010>) WHERE zgrp_id = <fs_t006>-zgrp_id.
              lv_count = lv_count + 1.
              "" Checking the Budget date of month & year with next month based on the given date
              IF <fs_t010>-zdate+0(6) = gv_edate+0(6).
                READ TABLE lt_t013 ASSIGNING FIELD-SYMBOL(<fs_t013>)  WITH KEY zsrc =  <fs_data>-zsrc zbukrs = p_bukrs.
                IF sy-subrc = 0.
                  TRY.<fs_data>-b01 = ( <fs_t010>-zamt * <fs_t013>-zbuc1 ) / 100.CATCH cx_sy_arithmetic_overflow.ENDTRY.
                  TRY.<fs_data>-b02 = ( <fs_t010>-zamt * <fs_t013>-zbuc2 ) / 100.CATCH cx_sy_arithmetic_overflow.ENDTRY.
                  TRY.<fs_data>-b03 = ( <fs_t010>-zamt * <fs_t013>-zbuc3 ) / 100.CATCH cx_sy_arithmetic_overflow.ENDTRY.
                ENDIF.
              ELSE.
                CLEAR:lv_days, lv_fld.
                lv_days = <fs_t010>-zdate - gv_sdate.
                LOOP AT gt_buck ASSIGNING FIELD-SYMBOL(<fs_buck>) WHERE zf_days <= lv_days AND zt_days >= lv_days .
                  lv_fld = 'B' && <fs_buck>-zbuc.
                  ASSIGN COMPONENT lv_fld OF STRUCTURE <fs_data> TO FIELD-SYMBOL(<fs_value>).
                  IF sy-subrc = 0.
                    <fs_value> = <fs_value> + <fs_t010>-zamt.
                  ENDIF.
                ENDLOOP.
              ENDIF.
            ENDLOOP.
          ENDIF.
      ENDCASE.

      "" total
      <fs_data>-tot = <fs_data>-b01 + <fs_data>-b02 + <fs_data>-b03 + <fs_data>-b04 + <fs_data>-b05.

      "" converting based on the radio amount selection
      IF gv_div IS NOT INITIAL.
        TRY.<fs_data>-b01 = <fs_data>-b01 / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
        TRY.<fs_data>-b02 = <fs_data>-b02 / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
        TRY.<fs_data>-b03 = <fs_data>-b03 / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
        TRY.<fs_data>-b04 = <fs_data>-b04 / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
        TRY.<fs_data>-b05 = <fs_data>-b05 / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
        TRY.<fs_data>-tot = <fs_data>-tot / gv_div.CATCH cx_sy_arithmetic_overflow.ENDTRY.
      ENDIF.

      IF <fs_data>-zint_spl = 'X'.
        <fs_data>-color+3(1) = '1'.
      ENDIF.
    ENDLOOP.

    "" Total of the sub heading
    PERFORM level_totals.

    "" Sub Totals
    PERFORM sub_totals.

    "" Display zero values check
    IF p_check <> 'X'.
      DELETE gt_data WHERE tot IS INITIAL AND color IS INITIAL AND zgrp_id <> 'A'.
    ENDIF.

    "" Internal split Check
    IF p_isplit = 'X'.
      DELETE gt_data WHERE zint_spl IS NOT INITIAL AND color+3(1) = '1' AND zgrp_id <> 'A'.
    ENDIF.

    "" Convert Amount to character
    PERFORM amt_to_char.

  ENDIF.
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



  PERFORM fcat USING 'ZGRP_ID' 'Group ID'.
  PERFORM fcat USING 'ZGRP_NAME' 'Group Name'.
  PERFORM fcat USING 'ZSRC' 'Source'.
  PERFORM fcat USING 'ZXBRL' 'Source'.
  PERFORM fcat USING 'CB01' '01 to 07 Days'.
  PERFORM fcat USING 'CB02' '08 to 14 Days'.
  PERFORM fcat USING 'CB03' '15 Days to 01 Months'.
  PERFORM fcat USING 'CB04' '01 to 03 Months'.
  PERFORM fcat USING 'CB05' '03 to 06 Months'.
  PERFORM fcat USING 'CTOT' 'Total'.
  PERFORM fcat USING 'ZINT_SPL' 'Int Split'.
  PERFORM fcat USING 'ZPRODUCT' 'Product Type'.

  IF gt_data IS NOT INITIAL.
    gs_layout-cwidth_opt = 'X'.
    gs_variant-report   = sy-repid.
    gs_layout-info_fname =      'COLOR'.
    gs_layout-stylefname = 'CELLTAB'.
    gs_layout-ctab_fname = 'COLORTAB'.

*    "FM to display ALV
    CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY_LVC'
      EXPORTING
        i_callback_program      = sy-cprog
        i_callback_user_command = 'USER_COMMAND'
*       i_callback_pf_status_set = 'ZSTATUS'
        i_callback_top_of_page  = 'TOP-OF-PAGE'
        is_layout_lvc           = gs_layout
        it_fieldcat_lvc         = gt_fcat
        i_html_height_top       = 20
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
    MESSAGE 'No Data Found' TYPE 'S'.
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
    WHEN  'CB01' OR 'CB02' OR 'CB03' OR 'CB04' OR 'CB05'  .
      gs_fcat-just = 'R'.
    WHEN 'CTOT'.
      gs_fcat-emphasize  = 'C500'.
      gs_fcat-just = 'R'.
    WHEN 'ZINT_SPL'.
      gs_fcat-checkbox = abap_true.
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

  SELECT SINGLE ltx
    FROM t247
    INTO @DATA(lv_month)
    WHERE mnr EQ @p_mon
    AND spras EQ @sy-langu.

  lt_heading-typ = 'H'.
  lt_heading-info = lv_comp_name.
  APPEND lt_heading.
  CLEAR lt_heading.

*  lt_heading-typ = 'H'.
*  lt_heading-info = TEXT-007.
*  APPEND lt_heading.
*  CLEAR lt_heading.

  lt_heading-typ = 'S'.
  lt_heading-key = 'Calendar Month : '.
  lt_heading-info = lv_month. "p_mon.
  APPEND lt_heading.
  CLEAR lt_heading.

  lt_heading-typ = 'S'.
  lt_heading-key = 'Calendar Year : '.
  lt_heading-info = p_year.
  APPEND lt_heading.
  CLEAR lt_heading.

  IF rb1 IS NOT INITIAL.
    lt_heading-key = 'Amount In Crores'.
  ELSEIF rb2 IS NOT INITIAL.
    lt_heading-key = 'Amount In Lakhs'.
  ELSEIF rb3 IS NOT INITIAL.
    lt_heading-key = 'Amount In Thousands'.
  ELSEIF rb4 IS NOT INITIAL.
    lt_heading-key = 'Amount In Inr'.
  ENDIF.
  lt_heading-typ = 'S'.
  APPEND lt_heading.
  CLEAR lt_heading.

  "eoc
  CALL FUNCTION 'REUSE_ALV_COMMENTARY_WRITE'
    EXPORTING
      it_list_commentary = lt_heading[].

  REFRESH lt_heading[].

ENDFORM.                    "top-of-page

FORM user_command USING r_ucomm LIKE sy-ucomm rs_selfield TYPE slis_selfield.

  READ TABLE gt_data ASSIGNING <fs_data> INDEX rs_selfield-tabindex.
  IF sy-subrc = 0.
    CLEAR:rt_prd.
    CASE r_ucomm.
      WHEN '&IC1'.
        CASE <fs_data>-zsrc.
          WHEN 12 OR 11 OR 10 OR 09. "" TRM
            PERFORM fetch_product_type.
            SUBMIT /fs00/almr003   WITH p_bukrs = p_bukrs
                     WITH p_mon = p_mon
                     WITH p_year = p_year
                     WITH s_prd IN rt_prd
                     WITH rb1 = rb1
                     WITH rb2 = rb2
                     WITH rb3 = rb3
                     WITH rb4 = rb4
                     AND RETURN .
        ENDCASE.

    ENDCASE.
  ENDIF.

  DATA: ls_/fs00/almtr014 TYPE /fs00/almtr014,
        ls_/fs00/almtr012 TYPE /fs00/almtr012.

  DATA: lv_answer TYPE c,
        lv_msg    TYPE c LENGTH 100.

  CASE r_ucomm.
    WHEN 'SAVE'.
      CLEAR:lv_answer.
      AUTHORITY-CHECK OBJECT 'ZFS_ALM_S1' ID 'ACTVT' FIELD '01'.    "Changed by Arpan on 24.09.2024
      IF sy-subrc = 0.
        SELECT *
          FROM /fs00/almtr014
          INTO TABLE @DATA(lt_/fs00/almtr014)
          WHERE zbukrs = @p_bukrs
          AND zmonth = @p_mon
          AND zyear = @p_year.

        IF lt_/fs00/almtr014 IS NOT INITIAL.
          MESSAGE: 'Data already saved for entered month and year' TYPE 'I' DISPLAY LIKE 'I'.
        ELSE.

          CLEAR:lt_/fs00/almtr014.
          LOOP AT gt_data INTO gs_data WHERE tot IS NOT INITIAL.
            ls_/fs00/almtr014-zbukrs = p_bukrs.
            ls_/fs00/almtr014-zmonth = p_mon.
            ls_/fs00/almtr014-zyear = p_year.
            ls_/fs00/almtr014-zdate = gv_date.
            ls_/fs00/almtr014-zgrp_id = gs_data-zgrp_id.
            ls_/fs00/almtr014-zgrp_name = gs_data-zgrp_name.
            ls_/fs00/almtr014-zbuc1 = gs_data-b01.
            ls_/fs00/almtr014-zbuc2 = gs_data-b02.
            ls_/fs00/almtr014-zbuc3 = gs_data-b03.
            ls_/fs00/almtr014-zbuc4 = gs_data-b04.
            ls_/fs00/almtr014-zbuc5 = gs_data-b05.
            ls_/fs00/almtr014-zcreated_by = sy-uname.
            ls_/fs00/almtr014-zcreated_date = sy-datum.
            ls_/fs00/almtr014-zcreated_time = sy-uzeit.
            APPEND ls_/fs00/almtr014 TO lt_/fs00/almtr014.
            CLEAR ls_/fs00/almtr014.
          ENDLOOP.

          IF lt_/fs00/almtr014 IS NOT INITIAL.
            MODIFY /fs00/almtr014 FROM TABLE lt_/fs00/almtr014.
            MESSAGE 'Data Updated Successfully' TYPE 'S'.
            COMMIT WORK AND WAIT .

*            PERFORM alm_logs USING 'Save' p_mon p_year.
          ENDIF.
        ENDIF.
      ELSE.
        MESSAGE 'No Authorisation to Save.' TYPE 'I'.
      ENDIF.

    WHEN 'LOCK'.
      AUTHORITY-CHECK OBJECT 'ZFS_ALM_L1' ID 'ACTVT' FIELD '05'.
      IF sy-subrc = 0.

        SELECT *
         FROM /fs00/almtr014
         INTO TABLE lt_/fs00/almtr014
         WHERE zbukrs = p_bukrs
         AND zmonth = p_mon
         AND zyear = p_year.

        IF lt_/fs00/almtr014 IS NOT INITIAL.

          SELECT COUNT(*) FROM /fs00/almtr012 WHERE zsource = '01' AND zdate = gv_date AND zlock = 'X'.
          IF sy-subrc = 0.
            MESSAGE: 'Data already Locked for entered Month and Year' TYPE 'I' DISPLAY LIKE 'I'.
          ELSE.

            ls_/fs00/almtr012-zbukrs = p_bukrs.
            ls_/fs00/almtr012-zsource = '01'.
            ls_/fs00/almtr012-zdate = gv_date.
            ls_/fs00/almtr012-zlock = 'X'.
            ls_/fs00/almtr012-zcreated_by = sy-uname.
            ls_/fs00/almtr012-zcreated_date = sy-datum.
            ls_/fs00/almtr012-zcreated_time = sy-uzeit.
            MODIFY /fs00/almtr012 FROM ls_/fs00/almtr012.
            COMMIT WORK AND WAIT .
            MESSAGE 'Lock Updated Successfully' TYPE 'S'.

            "" Update the lock Flag in data table
            UPDATE /fs00/almtr014 SET zlock = 'X'
                                        zcreated_by = sy-uname
                                        zcreated_date = sy-datum
                                        zcreated_time = sy-uzeit
                                    WHERE zbukrs = p_bukrs
                                      AND zmonth = p_mon
                                      AND zyear = p_year.
            COMMIT WORK AND WAIT .

*            PERFORM alm_logs USING 'Lock' p_mon p_year.
          ENDIF. "Count

        ELSE.
          MESSAGE 'Data not saved.Please save the data before lock the data.' TYPE 'I'.
        ENDIF.

      ELSE.
        MESSAGE 'No Authorisation to Lock' TYPE 'I'.
      ENDIF.

    WHEN 'REF'.
      PERFORM get_data.
      rs_selfield-refresh = 'X'.

    WHEN 'DELETE'.
      AUTHORITY-CHECK OBJECT 'ZFS_ALM_D1' ID 'ACTVT' FIELD '06'.
      IF sy-subrc = 0.
        SELECT COUNT(*) FROM /fs00/almtr012 WHERE zsource = '01' AND zdate = gv_date AND zlock = 'X'.
        IF sy-subrc = 0.
          MESSAGE : 'Data cannot be deleted since data is already locked for entered month and year' TYPE 'I' DISPLAY LIKE 'I'.
        ELSE.
          CLEAR: gv_ans.
          lv_msg = 'Are you sure you want to delete the data?'.
          PERFORM pop_up USING 'Delete Data' lv_msg.
          IF gv_ans = '1'.

            SELECT COUNT(*) FROM /fs00/almtr014 WHERE zbukrs = p_bukrs
                                                       AND zmonth = p_mon
                                                       AND zyear = p_year.
            IF sy-subrc = 0.
              DELETE FROM /fs00/almtr014 WHERE zbukrs = p_bukrs
                                             AND zmonth = p_mon
                                             AND zyear = p_year.
              COMMIT WORK AND WAIT .
              MESSAGE 'Data Deleted Successfully' TYPE 'S'.
            ELSE.
              MESSAGE 'Data does not exist for entered month and year' TYPE 'S'.
            ENDIF.  "Count save
          ENDIF. "pop up
        ENDIF."Count
      ELSE.
        MESSAGE 'No Authorisation to Delete' TYPE 'I'.
      ENDIF.
  ENDCASE.
ENDFORM.
*&---------------------------------------------------------------------*
*& Form get_dates
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
*& -->  p1        text
*& <--  p2        text
*&---------------------------------------------------------------------*
FORM get_dates .

  DATA: lv_date  TYPE sy-datum,
        lv_edate TYPE sy-datum.

  CLEAR:gv_sdate,gv_edate.
  gv_sdate = p_year && p_mon && '01'.

  "" Convert last day of month
  CALL FUNCTION 'RP_LAST_DAY_OF_MONTHS'
    EXPORTING
      day_in            = gv_sdate
    IMPORTING
      last_day_of_month = gv_sdate.
  gv_date = gv_sdate.
  gv_sdate = gv_sdate + 1.

  "" convert end date of the beting
  CALL FUNCTION 'RE_ADD_MONTH_TO_DATE'
    EXPORTING
      months  = '6'
      olddate = gv_sdate
    IMPORTING
      newdate = gv_edate.

  rt_date = VALUE #( sign = 'I' option = 'BT' ( low = gv_sdate high = gv_edate ) ).

  IF rb1 IS NOT INITIAL .
    gv_div =  10000000.
  ELSEIF rb2 IS NOT INITIAL.
    gv_div =  100000 .
  ELSEIF rb3 IS NOT INITIAL.
    gv_div =  1000.
  ENDIF.

ENDFORM.
*&---------------------------------------------------------------------*
*& Form fetch_trm_data
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
*& -->  p1        text
*& <--  p2        text
*&---------------------------------------------------------------------*
FORM fetch_trm_data .

  cl_salv_bs_runtime_info=>set( EXPORTING display  = abap_false
                                          metadata = abap_false
                                          data     = abap_true ).
  SUBMIT /fs00/almr003   WITH p_bukrs = p_bukrs
                     WITH p_mon = p_mon
                     WITH p_year = p_year
                     WITH rb1 = rb1
                     WITH rb2 = rb2
                     WITH rb3 = rb3
                     WITH rb4 = rb4
                     EXPORTING LIST TO MEMORY AND RETURN .

  TRY.
      cl_salv_bs_runtime_info=>get_data_ref( IMPORTING r_data = gt_dat ).
      ASSIGN gt_dat->* TO <fs_dat>.
      MOVE-CORRESPONDING <fs_dat> TO gt_trm.
    CATCH cx_salv_bs_sc_runtime_info.

  ENDTRY.
  cl_salv_bs_runtime_info=>clear_all( ).

  CALL METHOD cl_salv_bs_runtime_info=>set(
    EXPORTING
      display  = 'X'
      metadata = 'X'
      data     = 'X' ).

ENDFORM.

*&---------------------------------------------------------------------*
*&      Form  UPDATE_XBRL
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*  -->  p1        text
*  <--  p2        text
*----------------------------------------------------------------------*
FORM update_xbrl .

  gs_data-zgrp_id = 'A'.
  gs_data-zgrp_name = 'XBRL Code'.
  LOOP AT gt_buck ASSIGNING FIELD-SYMBOL(<fs_buck>).
    CASE <fs_buck>-zbuc.
      WHEN 1.
        gs_data-cb01 = <fs_buck>-zxbrl.
      WHEN 2.
        gs_data-cb02 = <fs_buck>-zxbrl.
      WHEN 3.
        gs_data-cb03 = <fs_buck>-zxbrl.
      WHEN 4.
        gs_data-cb04 = <fs_buck>-zxbrl.
      WHEN 5.
        gs_data-cb05 = <fs_buck>-zxbrl.
    ENDCASE.
  ENDLOOP.
  APPEND gs_data TO gt_data.
  CLEAR:gs_data.

ENDFORM.                    " UPDATE_XBRL

*&---------------------------------------------------------------------*
*&      Form  CELL_STYLE
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*  -->  p1        text
*  <--  p2        text
*----------------------------------------------------------------------*
FORM cell_style .

  CLEAR:gt_celltab.
  IF <fs_data>-color = 'C700'.

    gt_celltab = VALUE lvc_t_styl( ( fieldname = 'CB01'     style = gc_style_bold )
                                   ( fieldname = 'CB02'     style = gc_style_bold )
                                   ( fieldname = 'CB03'     style = gc_style_bold )
                                   ( fieldname = 'CB04'     style = gc_style_bold )
                                   ( fieldname = 'CB05'     style = gc_style_bold )
                                   ( fieldname = 'GRP_ID'   style = gc_style_bold )
                                   ( fieldname = 'GRP_NAME' style = gc_style_bold ) ).
  ENDIF.

  <fs_data>-celltab = gt_celltab.

ENDFORM.                    " CELL_STYLE
*&---------------------------------------------------------------------*
*&      Form  COLOR_LOGIC
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*  -->  p1        text
*  <--  p2        text
*----------------------------------------------------------------------*
FORM color_logic .

  CLEAR gt_color.
  IF <fs_data>-color IS INITIAL AND <fs_data>-zgrp_id <> 'A'.
    gt_color = VALUE lvc_t_scol( ( fname = 'CTOT' color-col = 5 )
                                 ( fname = 'TOT'  color-col = 5 ) ).
  ENDIF.

  <fs_data>-colortab = gt_color.

ENDFORM.                    " COLOR_LOGIC
*&---------------------------------------------------------------------*
*&      Form  FETCH_PRODUCT_TYPE
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*  -->  p1        text
*  <--  p2        text
*----------------------------------------------------------------------*
FORM fetch_product_type .
  DATA: lv_prd1  TYPE vvsart,
        lv_prd2  TYPE vvsart,
        lv_prd3  TYPE vvsart,
        lv_prd4  TYPE vvsart,
        lv_prd5  TYPE vvsart,
        lv_prd6  TYPE vvsart,
        lv_prd7  TYPE vvsart,
        lv_prd8  TYPE vvsart,
        lv_prd9  TYPE vvsart,
        lv_prd10 TYPE vvsart.

  SPLIT <fs_data>-zproduct AT ',' INTO lv_prd1 lv_prd2 lv_prd3 lv_prd4 lv_prd5 lv_prd6 lv_prd7 lv_prd8 lv_prd9 lv_prd10.

  rt_prd = VALUE #( sign = 'I' option = 'EQ' ( low = lv_prd1 )
                                             ( low = lv_prd2 )
                                             ( low = lv_prd3 )
                                             ( low = lv_prd4 )
                                             ( low = lv_prd5 )
                                             ( low = lv_prd6 )
                                             ( low = lv_prd7 )
                                             ( low = lv_prd8 )
                                             ( low = lv_prd9 )
                                             ( low = lv_prd10 ) ).

  DELETE rt_prd WHERE low IS INITIAL.

ENDFORM.                    " FETCH_PRODUCT_TYPE
*&---------------------------------------------------------------------*
*&      Form  LEVEL_TOTALS
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*  -->  p1        text
*  <--  p2        text
*----------------------------------------------------------------------*
FORM level_totals .

  "" fourth Level
  LOOP AT gt_data ASSIGNING <fs_data> WHERE zgrp3 <> '00' AND zgrp4 <> '00' AND zgrp5 = '00'.
    LOOP AT gt_data ASSIGNING FIELD-SYMBOL(<fs_sum>) WHERE zgrp_id+0(12) = <fs_data>-zgrp_id+0(12) .
      IF <fs_sum>-zgrp_id+12(2) <> '00'.
        IF <fs_sum>-zneg IS INITIAL.
          <fs_data>-b01 += <fs_sum>-b01.
          <fs_data>-b02 += <fs_sum>-b02.
          <fs_data>-b03 += <fs_sum>-b03.
          <fs_data>-b04 += <fs_sum>-b04.
          <fs_data>-b05 += <fs_sum>-b05.
        ELSE.
          <fs_data>-b01 = <fs_data>-b01 - <fs_sum>-b01.
          <fs_data>-b02 = <fs_data>-b02 - <fs_sum>-b02.
          <fs_data>-b03 = <fs_data>-b03 - <fs_sum>-b03.
          <fs_data>-b04 = <fs_data>-b04 - <fs_sum>-b04.
          <fs_data>-b05 = <fs_data>-b05 - <fs_sum>-b05.
        ENDIF.
      ENDIF.
    ENDLOOP.
    <fs_data>-tot = <fs_data>-b01 + <fs_data>-b02 + <fs_data>-b03 + <fs_data>-b04 + <fs_data>-b05.
  ENDLOOP.

  "" 3rd level Level
  LOOP AT gt_data ASSIGNING <fs_data> WHERE  zgrp3 <> '00' AND zgrp4 = '00' AND zgrp5 = '00'.
    LOOP AT gt_data ASSIGNING <fs_sum> WHERE zgrp_id+0(9) = <fs_data>-zgrp_id+0(9).
      IF <fs_sum>-zgrp_id+9(5) <> '00:00'.
        IF <fs_sum>-zgrp5 = '00'.
          IF <fs_sum>-zneg IS INITIAL.
            <fs_data>-b01 += <fs_sum>-b01.
            <fs_data>-b02 += <fs_sum>-b02.
            <fs_data>-b03 += <fs_sum>-b03.
            <fs_data>-b04 += <fs_sum>-b04.
            <fs_data>-b05 += <fs_sum>-b05.
          ELSE.
            <fs_data>-b01 = <fs_data>-b01 - <fs_sum>-b01.
            <fs_data>-b02 = <fs_data>-b02 - <fs_sum>-b02.
            <fs_data>-b03 = <fs_data>-b03 - <fs_sum>-b03.
            <fs_data>-b04 = <fs_data>-b04 - <fs_sum>-b04.
            <fs_data>-b05 = <fs_data>-b05 - <fs_sum>-b05.
          ENDIF.
        ENDIF.
      ENDIF.
    ENDLOOP.
    <fs_data>-tot = <fs_data>-b01 + <fs_data>-b02 + <fs_data>-b03 + <fs_data>-b04 + <fs_data>-b05.
  ENDLOOP.

  "" 1st level
  LOOP AT gt_data ASSIGNING <fs_data> WHERE zgrp3 = '00' AND zgrp4 = '00' AND zgrp5 = '00'.
    LOOP AT gt_data ASSIGNING <fs_sum> WHERE zgrp_id+0(6) = <fs_data>-zgrp_id+0(6).
      IF <fs_sum>-zgrp_id+6(8) <> '00:00:00'.
        IF <fs_sum>-zgrp5 = '00' AND <fs_sum>-zgrp4 = '00'.
          IF <fs_sum>-zneg IS INITIAL.
            <fs_data>-b01 += <fs_sum>-b01.
            <fs_data>-b02 += <fs_sum>-b02.
            <fs_data>-b03 += <fs_sum>-b03.
            <fs_data>-b04 += <fs_sum>-b04.
            <fs_data>-b05 += <fs_sum>-b05.
          ELSE.
            <fs_data>-b01 = <fs_data>-b01 - <fs_sum>-b01.
            <fs_data>-b02 = <fs_data>-b02 - <fs_sum>-b02.
            <fs_data>-b03 = <fs_data>-b03 - <fs_sum>-b03.
            <fs_data>-b04 = <fs_data>-b04 - <fs_sum>-b04.
            <fs_data>-b05 = <fs_data>-b05 - <fs_sum>-b05.
          ENDIF.
        ENDIF.
      ENDIF.
    ENDLOOP.
    <fs_data>-tot = <fs_data>-b01 + <fs_data>-b02 + <fs_data>-b03 + <fs_data>-b04 + <fs_data>-b05.
  ENDLOOP.

ENDFORM.                    " LEVEL_TOTALS
*&---------------------------------------------------------------------*
*&      Form  SUB_TOTALS
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*  -->  p1        text
*  <--  p2        text
*----------------------------------------------------------------------*
FORM sub_totals .

  "" Total of the sub heading
  LOOP AT gt_data ASSIGNING <fs_data> WHERE color = 'C300'.
    CLEAR:<fs_data>-b01,<fs_data>-b02,<fs_data>-b03,<fs_data>-b04,<fs_data>-b05,<fs_data>-tot.
    LOOP AT gt_data ASSIGNING FIELD-SYMBOL(<fs_sum>) WHERE zgrp_id+0(2) = <fs_data>-zgrp_id+0(2) AND zgrp_id+6(8) = '00:00:00'.
      <fs_data>-b01 += <fs_sum>-b01.
      <fs_data>-b02 += <fs_sum>-b02.
      <fs_data>-b03 += <fs_sum>-b03.
      <fs_data>-b04 += <fs_sum>-b04.
      <fs_data>-b05 += <fs_sum>-b05.
    ENDLOOP.
    <fs_data>-tot = <fs_data>-b01 + <fs_data>-b02 + <fs_data>-b03 + <fs_data>-b04 + <fs_data>-b05.
  ENDLOOP.
  DATA: lv_aa TYPE tpm_amount.
  " AC
  READ TABLE gt_data ASSIGNING FIELD-SYMBOL(<fs_tot>) WITH KEY zgrp1 = 'AC'.
  READ TABLE gt_data ASSIGNING <fs_data> WITH KEY zgrp_id = 'AB:99:99:99:99'.
  READ TABLE gt_data ASSIGNING <fs_sum> WITH  KEY zgrp_id = 'AA:99:99:99:99'.
  IF sy-subrc = 0.
    CLEAR:<fs_tot>-b01,<fs_tot>-b02,<fs_tot>-b03,<fs_tot>-b04,<fs_tot>-b05,<fs_tot>-tot.
    <fs_tot>-tot = <fs_data>-tot - <fs_sum>-tot.
    <fs_tot>-b01 = <fs_data>-b01 - <fs_sum>-b01.
    <fs_tot>-b02 = <fs_data>-b02 - <fs_sum>-b02.
    <fs_tot>-b03 = <fs_data>-b03 - <fs_sum>-b03.
    <fs_tot>-b04 = <fs_data>-b04 - <fs_sum>-b04.
    <fs_tot>-b05 = <fs_data>-b05 - <fs_sum>-b05.
    lv_aa = <fs_sum>-tot.
  ENDIF.


  "" AD Cumulative Mismatch
  READ TABLE gt_data ASSIGNING <fs_tot> WITH KEY zgrp1 = 'AD'.
  READ TABLE gt_data ASSIGNING <fs_data> WITH KEY zgrp_id = 'AC'.
  IF sy-subrc = 0.
    CLEAR:<fs_tot>-b01,<fs_tot>-b02,<fs_tot>-b03,<fs_tot>-b04,<fs_tot>-b05,<fs_tot>-tot.
    <fs_tot>-b01 = <fs_data>-b01.
    <fs_tot>-b02 = <fs_tot>-b01 + <fs_data>-b02.
    <fs_tot>-b03 = <fs_tot>-b02 + <fs_data>-b03.
    <fs_tot>-b04 = <fs_tot>-b03 + <fs_data>-b04.
    <fs_tot>-b05 = <fs_tot>-b04 + <fs_data>-b05.
    <fs_tot>-tot = <fs_tot>-b01 + <fs_tot>-b02 + <fs_tot>-b03 + <fs_tot>-b04 + <fs_tot>-b05.
  ENDIF.

  READ TABLE gt_data ASSIGNING <fs_tot> WITH KEY zgrp1 = 'AE'.
  READ TABLE gt_data ASSIGNING <fs_data> WITH  KEY zgrp_id = 'AA:99:99:99:99'.
  READ TABLE gt_data ASSIGNING <fs_sum> WITH KEY zgrp_id = 'AC'.
  IF sy-subrc = 0.
    CLEAR:<fs_tot>-b01,<fs_tot>-b02,<fs_tot>-b03,<fs_tot>-b04,<fs_tot>-b05,<fs_tot>-tot.
    TRY. <fs_tot>-tot = ( <fs_sum>-tot / <fs_data>-tot ) * 100.CATCH cx_sy_zerodivide.ENDTRY.
    TRY. <fs_tot>-b01 = ( <fs_sum>-b01 / <fs_data>-b01 ) * 100. CATCH cx_sy_zerodivide. ENDTRY.
    TRY. <fs_tot>-b02 = ( <fs_sum>-b02 / <fs_data>-b02 ) * 100. CATCH cx_sy_zerodivide. ENDTRY.
    TRY. <fs_tot>-b03 = ( <fs_sum>-b03 / <fs_data>-b03 ) * 100. CATCH cx_sy_zerodivide. ENDTRY.
    TRY. <fs_tot>-b04 = ( <fs_sum>-b04 / <fs_data>-b04 ) * 100. CATCH cx_sy_zerodivide. ENDTRY.
    TRY. <fs_tot>-b05 = ( <fs_sum>-b05 / <fs_data>-b05 ) * 100. CATCH cx_sy_zerodivide. ENDTRY.
  ENDIF.


ENDFORM.                    " SUB_TOTALS
*&---------------------------------------------------------------------*
*&      Form  AMT_TO_CHAR
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*  -->  p1        text
*  <--  p2        text
*----------------------------------------------------------------------*
FORM amt_to_char .
  LOOP AT gt_data ASSIGNING <fs_data> WHERE zgrp_id <> 'A'.
    IF <fs_data>-zint_spl = 'X'.
*      <fs_data>-color = 'C101'.
    ENDIF.

    "" Character to Amount Conversion
    PERFORM convert_char_to_amt USING <fs_data>-b01 CHANGING <fs_data>-cb01.

    PERFORM convert_char_to_amt USING <fs_data>-b02 CHANGING <fs_data>-cb02.

    PERFORM convert_char_to_amt USING <fs_data>-b03 CHANGING <fs_data>-cb03.

    PERFORM convert_char_to_amt USING <fs_data>-b04 CHANGING <fs_data>-cb04.

    PERFORM convert_char_to_amt USING <fs_data>-b05 CHANGING <fs_data>-cb05.

    PERFORM convert_char_to_amt USING <fs_data>-tot CHANGING <fs_data>-ctot.

  ENDLOOP.
ENDFORM.                    " AMT_TO_CHAR
*&---------------------------------------------------------------------*
*&      Form  CONVERT_CHAR_TO_AMT
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*  -->  p1        text
*  <--  p2        text
*----------------------------------------------------------------------*
FORM convert_char_to_amt USING p_amt CHANGING p_camt.
  IF p_amt > 0.
    p_camt = p_amt.
  ELSE.
    p_camt = p_amt.
    REPLACE ALL OCCURRENCES OF '-' IN p_camt WITH space.
  ENDIF.

  CALL FUNCTION 'FKK_AMOUNT_CHECK_AND_CONVERT'
    EXPORTING
      i_amount   = p_camt
      i_waers    = 'INR'
    IMPORTING
      e_amount_c = p_camt.
  IF p_amt < 0.
    p_camt = p_camt && '-'.
  ENDIF.

  IF p_camt = '0.00'.
    p_camt = ''.
  ENDIF.

ENDFORM.                    " CONVERT_CHAR_TO_AMT


*&---------------------------------------------------------------------*
*&      Form  ZSTATUS
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
FORM zstatus USING p_extab TYPE slis_t_extab.
  SET PF-STATUS 'ZSTATUS' .
ENDFORM.                    "zfs_screen

*&---------------------------------------------------------------------*
*&      Form  POP_UP
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*      -->P_2463   text
*      -->P_GV_MSG  text
*----------------------------------------------------------------------*
FORM pop_up  USING    p_title
                      p_msg.

  CLEAR:gv_ans.
  CALL FUNCTION 'POPUP_TO_CONFIRM'
    EXPORTING
      titlebar              = p_title
      text_question         = p_msg(100)
      text_button_1         = 'Yes'
      text_button_2         = 'No'
      display_cancel_button = ''
    IMPORTING
      answer                = gv_ans
    EXCEPTIONS
      text_not_found        = 1
      OTHERS                = 2.

ENDFORM.                    " POP_UP