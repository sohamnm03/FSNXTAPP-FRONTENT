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

  DATA: lv_no TYPE c LENGTH 2.

  PERFORM get_dates.

  "" beting Data
  CALL FUNCTION '/FS00/ALMFM001'
    EXPORTING
      im_type = '02'
      im_date = gv_sdate
    IMPORTING
      ex_buck = gt_buck.

  SELECT *
     FROM /fs00/almtr003
     INTO CORRESPONDING FIELDS OF TABLE gt_data.

  IF gt_data IS NOT INITIAL.
    SELECT *
      FROM /fs00/almtr008
      INTO TABLE @DATA(lt_source).

    SELECT *
      FROM /fs00/almtr018
      INTO TABLE @DATA(lt_gl)
      WHERE zgl_id <> ''
      ORDER BY zgr_id.

    SELECT *
    FROM /fs00/almtr030
    INTO TABLE @DATA(lt_manual)
    WHERE zbukrs = @p_bukrs
    AND zmonth = @p_mon
    AND zyear = @p_year.

    PERFORM submit_data.

    PERFORM update_xbrl.

    "" Interest Calc
    SORT gt_data BY zgrp_id.
    LOOP AT gt_data ASSIGNING <fs_data>.

      IF <fs_data>-zgrp_id+3(11) = '99:99:99:99'.
        <fs_data>-color = 'C300'.
      ELSEIF <fs_data>-zgrp_id = 'IA' OR <fs_data>-zgrp_id = 'IB' OR <fs_data>-zgrp_id = 'A' .
        <fs_data>-color = 'C700'.
      ENDIF.

      IF <fs_data>-zgrp_id+6(8) = '00:00:00'.
        <fs_data>-color = 'C100'.
      ENDIF.

      " Make Org Cover bold
      PERFORM cell_style..

      "" Color Logic
      PERFORM color_logic.

      IF <fs_data>-zsrc IS INITIAL.
        DATA(lv_index) = line_index( lt_gl[ zgr_id = <fs_data>-zgrp_id ] ).
        LOOP AT lt_gl ASSIGNING FIELD-SYMBOL(<fs_gl>) FROM lv_index WHERE zgrp_id = <fs_data>-zgrp_id AND zcal = '99'.
          CASE <fs_gl>-zcal.
            WHEN 99. "" TB Data
              READ TABLE gt_tb ASSIGNING FIELD-SYMBOL(<fs_tb>) WITH KEY gl_acc = <fs_gl>-zgl_id BINARY SEARCH.
              IF sy-subrc = 0.
                <fs_data>-zsrc = '99'.
                IF <fs_data>-zns = abap_true.
                  <fs_gl>-zbu_id = '11'.
                ENDIF.
                DATA(lv_sign) = COND i( WHEN <fs_gl>-ztype3 = '02' THEN -1 ELSE 1 ).
                ASSIGN COMPONENT |B{ <fs_gl>-zbu_id }| OF STRUCTURE <fs_data> TO FIELD-SYMBOL(<fs_value>).
                IF sy-subrc = 0.
                  <fs_value> = <fs_value> + ( <fs_tb>-bal * lv_sign ).
                ENDIF.
              ENDIF.
          ENDCASE.
        ENDLOOP.
      ENDIF.

      CASE <fs_data>-zsrc.
        WHEN '01' OR '02' OR '03' OR '04' OR '05' OR '06' OR '07' . "" CP Benpos
          LOOP AT gt_cp ASSIGNING FIELD-SYMBOL(<fs_cp>) WHERE source = <fs_data>-zsrc .
            ASSIGN COMPONENT |B{ <fs_cp>-bkt_no }| OF STRUCTURE <fs_data> TO <fs_value>.
            IF sy-subrc = 0.
              <fs_value> += <fs_cp>-os_amt .
            ENDIF.
          ENDLOOP.
        WHEN '13' OR '14' OR '15' OR '16' OR '17' OR '18' OR '19' . "" NCD Benpos
          IF <fs_data>-zgrp4 EQ '01'.
            LOOP AT gt_ncd ASSIGNING FIELD-SYMBOL(<fs_ncd>) WHERE source = <fs_data>-zsrc .
              ASSIGN COMPONENT |B{ <fs_ncd>-bkt_no }| OF STRUCTURE <fs_data> TO <fs_value>.
              IF sy-subrc = 0.
                <fs_value> += <fs_ncd>-os_amt .
              ENDIF.
            ENDLOOP.
          ENDIF.
        WHEN 92. "" Manual Update
          READ TABLE lt_manual ASSIGNING FIELD-SYMBOL(<fs_manual>) WITH KEY zcode = <fs_data>-zgrp_id.
          IF sy-subrc = 0.
            DO 10 TIMES.
              lv_no = sy-index.
              ASSIGN COMPONENT |ZBUC{ sy-index }| OF STRUCTURE <fs_manual>  TO FIELD-SYMBOL(<fs_src>).
              ASSIGN COMPONENT |B{ lv_no ALPHA = IN }| OF STRUCTURE <fs_data>  TO <fs_value>.
              IF sy-subrc = 0.
                <fs_value> +=  <fs_src> .
              ENDIF.
            ENDDO.
          ENDIF.
        WHEN 11. "" Pri O/S
          PERFORM fetch_product_type.
          PERFORM fetch_txn_type.
          IF rt_ttyp IS NOT INITIAL. "" Adding txn type to dynamic where condition
            DATA(lv_where) = 'SGSART IN RT_PRD  AND SFHAART in RT_TTYP AND FVAR+0(2) = <FS_DATA>-ZINT_TYPE'.
          ELSE.
            lv_where = 'SGSART IN RT_PRD AND FVAR+0(2) = <FS_DATA>-ZINT_TYPE' .
          ENDIF.
          LOOP AT gt_os ASSIGNING FIELD-SYMBOL(<fs_os>) WHERE (lv_where).""sgsart IN rt_prd .
            DO 10 TIMES.
              lv_no = sy-index.
              ASSIGN COMPONENT |B{ lv_no ALPHA = IN }| OF STRUCTURE <fs_os>  TO <fs_src>.
              ASSIGN COMPONENT |B{ lv_no ALPHA = IN }| OF STRUCTURE <fs_data>  TO <fs_value>.
              IF sy-subrc = 0.
                <fs_value> += <fs_src> .
              ENDIF.
            ENDDO.
          ENDLOOP.
        WHEN 64. "" Interest Accrual
          PERFORM fetch_product_type.
          LOOP AT gt_int ASSIGNING FIELD-SYMBOL(<fs_int>) .""WHERE sgsart IN rt_prd .
            ASSIGN COMPONENT |B{ <fs_int>-buck }| OF STRUCTURE <fs_data> TO <fs_value>.
            IF sy-subrc = 0.
              <fs_value> += <fs_int>-tot .
            ENDIF.
          ENDLOOP.
        WHEN '09'.
          PERFORM fetch_product_type.
          LOOP AT <fs_pinv> ASSIGNING FIELD-SYMBOL(<fs_inv>) .
            DO 10 TIMES.
              lv_no = sy-index.
              ASSIGN COMPONENT |B_{ lv_no ALPHA = IN }| OF STRUCTURE <fs_inv> TO <fs_src>.
              ASSIGN COMPONENT |B{ lv_no ALPHA = IN }| OF STRUCTURE <fs_data>  TO <fs_value>.
              IF sy-subrc = 0.
                <fs_value> += <fs_src> .
              ENDIF.
            ENDDO.
          ENDLOOP.
        WHEN '59' OR '60'.
          LOOP AT gt_prov ASSIGNING FIELD-SYMBOL(<fs_prov>) WHERE zsrc EQ <fs_data>-zsrc.
            DO 10 TIMES.
              lv_no = sy-index.
              ASSIGN COMPONENT |ZBUC{ lv_no }| OF STRUCTURE <fs_prov> TO <fs_src>.
              ASSIGN COMPONENT |B{ lv_no ALPHA = IN }| OF STRUCTURE <fs_data> TO <fs_value>.
              IF sy-subrc = 0.
                <fs_value> += <fs_src> .
              ENDIF.
            ENDDO.
          ENDLOOP.
      ENDCASE.

      "" Amount conversion Logic
      DO 11 TIMES.
        lv_no = sy-index.
        ASSIGN COMPONENT |B{ lv_no ALPHA = IN }| OF STRUCTURE <fs_data> TO <fs_value>.
        IF sy-subrc = 0.
          <fs_value> = abs( <fs_value> ).
          IF gv_div IS NOT INITIAL.
            TRY.<fs_value> /= gv_div.CATCH cx_sy_zerodivide. CLEAR <fs_value>. ENDTRY.
          ENDIF.
        ENDIF.
      ENDDO.
    ENDLOOP.
    SORT gt_data BY zgrp_id zxbrl.

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
      DELETE gt_data WHERE zint_split IS NOT INITIAL AND color+3(1) = '1' AND zgrp_id <> 'A'.
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
  PERFORM fcat USING 'CB03' '15 Days to 01 Month'.
  PERFORM fcat USING 'CB04' '01 to 02 Months'.
  PERFORM fcat USING 'CB05' '02 to 03 Months'.
  PERFORM fcat USING 'CB06' '03 to 06 Months'.
  PERFORM fcat USING 'CB07' '06 Months to 01 Year'.
  PERFORM fcat USING 'CB08' '01 to 03 Years'.
  PERFORM fcat USING 'CB09' '03 to 05 Years'.
  PERFORM fcat USING 'CB10' 'Over 05 Years'.
  PERFORM fcat USING 'CB11' 'Non-sensitive'.
  PERFORM fcat USING 'CTOT' 'Total'.
  PERFORM fcat USING 'ZINT_SPLIT' 'Int Split'.
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
    WHEN  'CB01' OR 'CB02' OR 'CB03' OR 'CB04' OR 'CB05' OR 'CB06' OR 'CB07' OR 'CB08' OR 'CB09' OR 'CB10' OR 'CB11'  .
      gs_fcat-just = 'R'.
    WHEN 'CTOT'.
      gs_fcat-emphasize  = 'C500'.
      gs_fcat-just = 'R'.
    WHEN 'ZXBRL'.
      gs_fcat-hotspot = 'X'.
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
          WHEN '11'.
            PERFORM fetch_product_type.
            PERFORM fetch_txn_type.
            SUBMIT /fs00/almr015    WITH p_bukrs = p_bukrs
                                    WITH p_mon = p_mon
                                    WITH p_year = p_year
                                    WITH s_prd IN rt_prd
                                    WITH s_ttyp IN rt_ttyp
                                    WITH rb1 = rb1
                                    WITH rb2 = rb2
                                    WITH rb3 = rb3
                                    WITH rb4 = rb4 AND RETURN .
          WHEN '64'.
            PERFORM fetch_product_type.
            SUBMIT /fs00/almr014    WITH p_bukrs = p_bukrs
                                    WITH p_mon = p_mon
                                    WITH p_year = p_year
                                    WITH s_prd IN rt_prd
                                    WITH rb1 = rb1
                                    WITH rb2 = rb2
                                    WITH rb3 = rb3
                                    WITH rb4 = rb4 AND RETURN .
          WHEN '09'.
            SUBMIT /fs00/almr018    WITH p_bukrs = p_bukrs
                                    WITH p_month = p_mon
                                    WITH p_year = p_year
                                    WITH rb1 = rb1
                                    WITH rb2 = rb2
                                    WITH rb3 = rb3
                                    WITH rb4 = rb4 AND RETURN .
          WHEN '99'.
            SUBMIT /fs00/almr010    WITH p_bukrs = p_bukrs
                                    WITH p_month = p_mon
                                    WITH p_year = p_year
                                    WITH p_as  = abap_true
                                    WITH p_grp2 = <fs_data>-zgrp_id
                                    WITH rb1 = rb1
                                    WITH rb2 = rb2
                                    WITH rb3 = rb3
                                    WITH rb4 = rb4 AND RETURN .
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
FORM submit_data .

  "" TB Data
  cl_salv_bs_runtime_info=>set( EXPORTING display  = abap_false
                                          metadata = abap_false
                                          data     = abap_true ).
  SUBMIT /fs00/almr010    WITH p_bukrs = p_bukrs
                          WITH p_month = p_mon
                          WITH p_year = p_year
                          WITH p_as  = abap_true
*                          WITH rb1 = rb1
*                          WITH rb2 = rb2
*                          WITH rb3 = rb3
*                          WITH rb4 = rb4
                          EXPORTING LIST TO MEMORY AND RETURN .

  TRY.
      cl_salv_bs_runtime_info=>get_data_ref( IMPORTING r_data = gt_dat ).
      ASSIGN gt_dat->* TO <fs_dat>.
      MOVE-CORRESPONDING <fs_dat> TO gt_tb.
      SORT gt_tb BY gl_acc ASCENDING.
    CATCH cx_salv_bs_sc_runtime_info.
  ENDTRY.

  cl_salv_bs_runtime_info=>clear_all( ).

  CALL METHOD cl_salv_bs_runtime_info=>set(
    EXPORTING
      display  = 'X'
      metadata = 'X'
      data     = 'X' ).

  "" TRM Interest ACcrual
  cl_salv_bs_runtime_info=>set( EXPORTING display  = abap_false
                                          metadata = abap_false
                                          data     = abap_true ).
  SUBMIT /fs00/almr014    WITH p_bukrs = p_bukrs
                          WITH p_mon = p_mon
                          WITH p_year = p_year
*                          WITH rb1 = rb1
*                          WITH rb2 = rb2
*                          WITH rb3 = rb3
*                          WITH rb4 = rb4
                          EXPORTING LIST TO MEMORY AND RETURN .

  TRY.
      cl_salv_bs_runtime_info=>get_data_ref( IMPORTING r_data = gt_dat ).
      ASSIGN gt_dat->* TO <fs_dat>.
      MOVE-CORRESPONDING <fs_dat> TO gt_int.
    CATCH cx_salv_bs_sc_runtime_info.
  ENDTRY.

  cl_salv_bs_runtime_info=>clear_all( ).

  CALL METHOD cl_salv_bs_runtime_info=>set(
    EXPORTING
      display  = 'X'
      metadata = 'X'
      data     = 'X' ).

  "" TRM Pri O/S
  cl_salv_bs_runtime_info=>set( EXPORTING display  = abap_false
                                          metadata = abap_false
                                          data     = abap_true ).
  SUBMIT /fs00/almr015    WITH p_bukrs = p_bukrs
                          WITH p_mon = p_mon
                          WITH p_year = p_year
*                          WITH rb1 = rb1
*                          WITH rb2 = rb2
*                          WITH rb3 = rb3
*                          WITH rb4 = rb4
                          EXPORTING LIST TO MEMORY AND RETURN .

  TRY.
      cl_salv_bs_runtime_info=>get_data_ref( IMPORTING r_data = gt_dat ).
      ASSIGN gt_dat->* TO <fs_dat>.
      MOVE-CORRESPONDING <fs_dat> TO gt_os.
    CATCH cx_salv_bs_sc_runtime_info.
  ENDTRY.

  cl_salv_bs_runtime_info=>clear_all( ).

  CALL METHOD cl_salv_bs_runtime_info=>set(
    EXPORTING
      display  = 'X'
      metadata = 'X'
      data     = 'X' ).

  "" TRM Investment Pri
  cl_salv_bs_runtime_info=>set( EXPORTING display  = abap_false
                                          metadata = abap_false
                                          data     = abap_true ).
  SUBMIT /fs00/almr018    WITH p_bukrs = p_bukrs
                          WITH p_month = p_mon
                          WITH p_year = p_year
*                          WITH rb1 = rb1
*                          WITH rb2 = rb2
*                          WITH rb3 = rb3
*                          WITH rb4 = rb4
                          EXPORTING LIST TO MEMORY AND RETURN .

  TRY.
      cl_salv_bs_runtime_info=>get_data_ref( IMPORTING r_data = gt_dat ).
      ASSIGN gt_dat->* TO <fs_pinv>.
*      MOVE-CORRESPONDING <fs_dat> TO <fs_pinv>.
    CATCH cx_salv_bs_sc_runtime_info.
  ENDTRY.

  cl_salv_bs_runtime_info=>clear_all( ).

  CALL METHOD cl_salv_bs_runtime_info=>set(
    EXPORTING
      display  = 'X'
      metadata = 'X'
      data     = 'X' ).

  "" CP,NCD benpos
  cl_salv_bs_runtime_info=>set( EXPORTING display  = abap_false
                                          metadata = abap_false
                                          data     = abap_true ).
  SUBMIT /fs00/almr021    WITH p_bukrs = p_bukrs
                          WITH p_month = p_mon
                          WITH p_year = p_year
                          WITH rb_cp = abap_true
                          WITH rb_ncd = abap_false
                          EXPORTING LIST TO MEMORY AND RETURN .

  TRY.
      cl_salv_bs_runtime_info=>get_data_ref( IMPORTING r_data = gt_dat ).
      ASSIGN gt_dat->* TO <fs_dat>.
      MOVE-CORRESPONDING <fs_dat> TO gt_cp.
    CATCH cx_salv_bs_sc_runtime_info.
  ENDTRY.

  cl_salv_bs_runtime_info=>clear_all( ).

  SUBMIT /fs00/almr021    WITH p_bukrs = p_bukrs
                          WITH p_month = p_mon
                          WITH p_year = p_year
                          WITH rb_cp = abap_false
                          WITH rb_ncd = abap_true
                          EXPORTING LIST TO MEMORY AND RETURN .

  TRY.
      cl_salv_bs_runtime_info=>get_data_ref( IMPORTING r_data = gt_dat ).
      ASSIGN gt_dat->* TO <fs_dat>.
      MOVE-CORRESPONDING <fs_dat> TO gt_ncd.
    CATCH cx_salv_bs_sc_runtime_info.
  ENDTRY.

  cl_salv_bs_runtime_info=>clear_all( ).

  CALL METHOD cl_salv_bs_runtime_info=>set(
    EXPORTING
      display  = 'X'
      metadata = 'X'
      data     = 'X' ).
  " Provisions Data
  cl_salv_bs_runtime_info=>set( EXPORTING display  = abap_false
                                          metadata = abap_false
                                          data     = abap_true ).

  SUBMIT /fs00/almr024 WITH p_bukrs EQ p_bukrs
                       WITH p_month EQ p_mon
                       WITH p_year EQ p_year
                       EXPORTING LIST TO MEMORY AND RETURN.
  TRY.
      cl_salv_bs_runtime_info=>get_data_ref( IMPORTING r_data = gt_dat ).
      ASSIGN gt_dat->* TO <fs_dat>.
      MOVE-CORRESPONDING <fs_dat> TO gt_prov.
    CATCH cx_salv_bs_sc_runtime_info.
  ENDTRY.

  cl_salv_bs_runtime_info=>clear_all( ).

  cl_salv_bs_runtime_info=>set( EXPORTING display  = abap_true
                                          metadata = abap_true
                                          data     = abap_true ).
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
    ASSIGN COMPONENT |CB{ <fs_buck>-zbuc }| OF STRUCTURE gs_data TO FIELD-SYMBOL(<fs_value>).
    IF sy-subrc = 0.
      <fs_value> = <fs_buck>-zxbrl .
    ENDIF.
  ENDLOOP.
  gs_data-cb11 = 'X110'.
  gs_data-ctot = 'X120'.
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
  IF <fs_data>-color = 'C700' OR <fs_data>-zgrp_id+6(8) = '00:00:00'.

    gt_celltab = VALUE lvc_t_styl( ( fieldname = 'CB01'      style = gc_style_bold )
                                   ( fieldname = 'CB02'      style = gc_style_bold )
                                   ( fieldname = 'CB03'      style = gc_style_bold )
                                   ( fieldname = 'CB04'      style = gc_style_bold )
                                   ( fieldname = 'CB05'      style = gc_style_bold )
                                   ( fieldname = 'CB06'      style = gc_style_bold )
                                   ( fieldname = 'CB07'      style = gc_style_bold )
                                   ( fieldname = 'CB08'      style = gc_style_bold )
                                   ( fieldname = 'CB09'      style = gc_style_bold )
                                   ( fieldname = 'CB10'      style = gc_style_bold )
                                   ( fieldname = 'CB11'      style = gc_style_bold )
                                   ( fieldname = 'CTOT'      style = gc_style_bold )
                                   ( fieldname = 'ZGRP_ID'   style = gc_style_bold )
                                   ( fieldname = 'ZGRP_NAME' style = gc_style_bold ) ).
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

  SPLIT <fs_data>-zproduct AT ',' INTO DATA(lv_prd1) DATA(lv_prd2) DATA(lv_prd3) DATA(lv_prd4) DATA(lv_prd5) DATA(lv_prd6) DATA(lv_prd7) DATA(lv_prd8) DATA(lv_prd9) DATA(lv_prd10).
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

  DATA: lv_count TYPE c LENGTH 2.

  "" fifth Level
  LOOP AT gt_data ASSIGNING <fs_data> WHERE zgrp3 <> '00' AND zgrp4 <> '00' AND zgrp5 <> '00' AND zgrp6 = '00'.
    LOOP AT gt_data ASSIGNING FIELD-SYMBOL(<fs_sum>) WHERE zgrp_id+0(15) = <fs_data>-zgrp_id+0(15).
      IF <fs_sum>-zgrp_id+15(2) <> '00'.
        DATA(lv_sign) = COND i( WHEN <fs_sum>-zneg IS INITIAL THEN 1 ELSE -1 ).

        CLEAR:lv_count.
        DO 11 TIMES.
          lv_count = sy-index.
          ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE <fs_data> TO FIELD-SYMBOL(<lv_data>).
          ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE <fs_sum>  TO FIELD-SYMBOL(<lv_sum>).

          IF <lv_data> IS ASSIGNED AND <lv_sum> IS ASSIGNED.
            <lv_data> = <lv_data> + ( lv_sign * <lv_sum> ).
          ENDIF.
        ENDDO.
      ENDIF.
    ENDLOOP.
    <fs_data>-tot = <fs_data>-b01 + <fs_data>-b02 + <fs_data>-b03 + <fs_data>-b04 + <fs_data>-b05 +
                     <fs_data>-b06 + <fs_data>-b07 + <fs_data>-b08 + <fs_data>-b09 + <fs_data>-b10 + <fs_data>-b11 .
  ENDLOOP.

  "" fourth Level
  LOOP AT gt_data ASSIGNING <fs_data> WHERE zgrp3 <> '00' AND zgrp4 <> '00' AND zgrp5 = '00' AND zgrp6 = '00'.
    LOOP AT gt_data ASSIGNING <fs_sum> WHERE zgrp_id+0(12) = <fs_data>-zgrp_id+0(12).
      IF <fs_sum>-zgrp_id+12(5) <> '00:00'.
        lv_sign = COND i( WHEN <fs_sum>-zneg IS INITIAL THEN 1 ELSE -1 ).

        CLEAR:lv_count.
        DO 11 TIMES.
          lv_count = sy-index.
          ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE <fs_data> TO <lv_data>.
          ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE <fs_sum>  TO <lv_sum>.

          IF <lv_data> IS ASSIGNED AND <lv_sum> IS ASSIGNED.
            <lv_data> = <lv_data> + ( lv_sign * <lv_sum> ).
          ENDIF.
        ENDDO.
      ENDIF.
    ENDLOOP.
    <fs_data>-tot = <fs_data>-b01 + <fs_data>-b02 + <fs_data>-b03 + <fs_data>-b04 + <fs_data>-b05 +
                     <fs_data>-b06 + <fs_data>-b07 + <fs_data>-b08 + <fs_data>-b09 + <fs_data>-b10 + <fs_data>-b11 .
  ENDLOOP.

  "" 3rd level Level
  LOOP AT gt_data ASSIGNING <fs_data> WHERE  zgrp3 <> '00' AND zgrp4 = '00' AND zgrp5 = '00' AND zgrp6 = '00'.
    LOOP AT gt_data ASSIGNING <fs_sum> WHERE zgrp_id+0(9) = <fs_data>-zgrp_id+0(9).
      IF <fs_sum>-zgrp_id+9(8) <> '00:00:00'.
        IF <fs_sum>-zgrp5 = '00'.
          lv_sign = COND i( WHEN <fs_sum>-zneg IS INITIAL THEN 1 ELSE -1 ).

          CLEAR:lv_count.
          DO 11 TIMES.
            lv_count = sy-index.
            ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE <fs_data> TO <lv_data>.
            ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE <fs_sum>  TO <lv_sum>.

            IF <lv_data> IS ASSIGNED AND <lv_sum> IS ASSIGNED.
              <lv_data> = <lv_data> + ( lv_sign * <lv_sum> ).
            ENDIF.
          ENDDO.
        ENDIF.
      ENDIF.
    ENDLOOP.
    <fs_data>-tot = <fs_data>-b01 + <fs_data>-b02 + <fs_data>-b03 + <fs_data>-b04 + <fs_data>-b05 +
                      <fs_data>-b06 + <fs_data>-b07 + <fs_data>-b08 + <fs_data>-b09 + <fs_data>-b10 + <fs_data>-b11.
  ENDLOOP.

  "" 1st level
  LOOP AT gt_data ASSIGNING <fs_data> WHERE zgrp3 = '00' AND zgrp4 = '00' AND zgrp5 = '00' AND zgrp6 = '00'.
    LOOP AT gt_data ASSIGNING <fs_sum> WHERE zgrp_id+0(6) = <fs_data>-zgrp_id+0(6).
      IF <fs_sum>-zgrp_id+6(11) <> '00:00:00:00'.
        IF <fs_sum>-zgrp5 = '00' AND <fs_sum>-zgrp4 = '00'.
          lv_sign = COND i( WHEN <fs_sum>-zneg IS INITIAL THEN 1 ELSE -1 ).
          CLEAR:lv_count.
          DO 11 TIMES.
            lv_count = sy-index.
            ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE <fs_data> TO <lv_data>.
            ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE <fs_sum>  TO <lv_sum>.

            IF <lv_data> IS ASSIGNED AND <lv_sum> IS ASSIGNED.
              <lv_data> = <lv_data> + ( lv_sign * <lv_sum> ).
            ENDIF.
          ENDDO.
        ENDIF.
      ENDIF.
    ENDLOOP.
    <fs_data>-tot = <fs_data>-b01 + <fs_data>-b02 + <fs_data>-b03 + <fs_data>-b04 + <fs_data>-b05 +
                     <fs_data>-b06 + <fs_data>-b07 + <fs_data>-b08 + <fs_data>-b09 + <fs_data>-b10 + <fs_data>-b11.
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
  DATA:lv_prev TYPE tb_limit_amount.
  DATA: lv_count TYPE c LENGTH 2.

  "" Total of the sub heading
  LOOP AT gt_data ASSIGNING <fs_data> WHERE color = 'C300'.
    LOOP AT gt_data ASSIGNING FIELD-SYMBOL(<fs_sum>) WHERE zgrp_id+0(2) = <fs_data>-zgrp_id+0(2) AND zgrp_id+6(8) = '00:00:00'.
      CLEAR:lv_count.
      DO 11 TIMES.
        lv_count = sy-index.
        ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE <fs_data> TO FIELD-SYMBOL(<lv_data>).
        ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE <fs_sum>  TO FIELD-SYMBOL(<lv_sum>).
        IF <lv_data> IS ASSIGNED AND <lv_sum> IS ASSIGNED.
          <lv_data> += <lv_sum>.
        ENDIF.
      ENDDO.
    ENDLOOP.
    <fs_data>-tot = <fs_data>-b01 + <fs_data>-b02 + <fs_data>-b03 + <fs_data>-b04 + <fs_data>-b05 + <fs_data>-b06 + <fs_data>-b07 + <fs_data>-b08 + <fs_data>-b09 + <fs_data>-b10.
  ENDLOOP.

  "" SA_A1
  READ TABLE gt_data ASSIGNING <fs_sum> WITH  KEY zgrp_id = 'IA:99:99:99:99:99'.
  IF sy-subrc = 0.
    gs_data-zgrp_name = 'Cumulative Outflows'.
    gs_data-zgrp_id = 'IA:99:99:99:99:99_A1'.
    gs_data-color = 'C310'.
    gs_data-zxbrl = 'Y1230'.

    CLEAR:lv_count.
    DO 11 TIMES.
      lv_count = sy-index.
      ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE <fs_sum> TO FIELD-SYMBOL(<lv_src>).
      ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE gs_data TO FIELD-SYMBOL(<lv_tgt>).
      IF sy-index = 1.
        <lv_tgt> = <lv_src>.
      ELSE.
        <lv_tgt> = lv_prev + <lv_src>.
      ENDIF.
      lv_prev = <lv_tgt>.
    ENDDO.

    APPEND gs_data TO gt_data.
    CLEAR:gs_data.
  ENDIF.

  DATA: lv_ia TYPE tpm_amount,
        lv_ib TYPE tpm_amount.
  "" SC
  READ TABLE gt_data ASSIGNING <fs_data> WITH KEY zgrp_id = 'IB:99:99:99:99:99'.
  READ TABLE gt_data ASSIGNING <fs_sum> WITH  KEY zgrp_id = 'IA:99:99:99:99:99'.
  IF sy-subrc = 0.
    gs_data-zgrp_name = 'C. Mismatch (IB-IA)'.
    gs_data-zgrp_id = 'IC'.
    gs_data-color = 'C310'.
    gs_data-zxbrl = 'Y1770'.
    gs_data-tot = <fs_data>-tot - <fs_sum>-tot.

    lv_ib = <fs_data>-tot.
    lv_ia = <fs_sum>-tot.

    CLEAR:lv_count.
    DO 11 TIMES.
      lv_count = sy-index.
      ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE <fs_data> TO <lv_data>.
      ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE <fs_sum>  TO <lv_sum>.
      ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE gs_data  TO <lv_tgt>.
      IF <lv_data> IS ASSIGNED AND <lv_sum> IS ASSIGNED.
        <lv_tgt> = <lv_data> - <lv_sum>.
      ENDIF.
    ENDDO.

    gs_data-tot = gs_data-b01 + gs_data-b02 + gs_data-b03 + gs_data-b04 + gs_data-b05 +
                  gs_data-b06 + gs_data-b07 + gs_data-b08 + gs_data-b09 + gs_data-b10 + gs_data-b11.

    APPEND gs_data TO gt_data.
    CLEAR:gs_data.
  ENDIF.


  "" AD Cumulative Mismatch
  READ TABLE gt_data ASSIGNING <fs_data> WITH KEY zgrp_id = 'IC'.
  IF sy-subrc = 0.
    gs_data-zgrp_name = 'D. Cumulative mismatch'.
    gs_data-zgrp_id = 'ID'.
    gs_data-color = 'C210'."'C710'.
    gs_data-zxbrl = 'Y1780'.
    gs_data-b01 = <fs_data>-b01.

    CLEAR:lv_count.
    DO 11 TIMES.
      lv_count = sy-index.
      ASSIGN COMPONENT |B{ lv_count ALPHA = IN  }| OF STRUCTURE <fs_data> TO <lv_src>.
      ASSIGN COMPONENT |B{ lv_count ALPHA = IN  }| OF STRUCTURE gs_data TO <lv_tgt>.
      IF sy-index = 1.
        <lv_tgt> = <lv_src>.
      ELSE.
        <lv_tgt> = lv_prev + <lv_src>.
      ENDIF.
      lv_prev = <lv_tgt>.
    ENDDO.

    gs_data-tot = gs_data-b01 + gs_data-b02 + gs_data-b03 + gs_data-b04 + gs_data-b05 +
                  gs_data-b06 + gs_data-b07 + gs_data-b08 + gs_data-b09 + gs_data-b10 + gs_data-b11.
    APPEND gs_data TO gt_data.
    CLEAR:gs_data.
  ENDIF.


  READ TABLE gt_data ASSIGNING <fs_data> WITH  KEY zgrp_id = 'IA:99:99:99:99:99'.
  READ TABLE gt_data ASSIGNING <fs_sum> WITH KEY zgrp_id = 'IC'.
  IF sy-subrc = 0.
    gs_data-zgrp_name = 'E. Mismatch as % of Total Outflows'.
    gs_data-zgrp_id = 'IE'.
    gs_data-color = 'C100'."'C310'.
    gs_data-zxbrl = 'Y1790'.

    DO 11 TIMES.
      lv_count = sy-index.

      ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE <fs_data> TO FIELD-SYMBOL(<fs_data_val>).
      ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE <fs_sum>  TO FIELD-SYMBOL(<fs_sum_val>).
      ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE gs_data   TO FIELD-SYMBOL(<fs_out_val>).

      IF <fs_data_val> <= 0.
        <fs_out_val> = '0.00'.
      ELSE.
        TRY.
            <fs_out_val> = ( <fs_sum_val> / <fs_data_val> ) * 100.
          CATCH cx_sy_zerodivide.
            <fs_out_val> = '0.00'.
        ENDTRY.
      ENDIF.
    ENDDO.
    TRY.
        gs_data-tot = COND #( WHEN lv_ia > 0 THEN round( val = ( lv_ib - lv_ia ) / lv_ia dec = 4 )
        ELSE 0
        ).
        gs_data-tot = gs_data-tot * 100.
      CATCH cx_root.
    ENDTRY.
    APPEND gs_data TO gt_data.
    CLEAR:gs_data.
  ENDIF.

  "" AF Cumulative Mismatch
  READ TABLE gt_data ASSIGNING <fs_data> WITH  KEY zgrp_id = 'IA:99:99:99:99:99_A1'.
  READ TABLE gt_data ASSIGNING <fs_sum> WITH KEY zgrp_id = 'ID'.
  IF sy-subrc = 0.
    gs_data-zgrp_name = 'F. Cumulative Mismatch as % of Cumulative Total Outflows'.
    gs_data-zgrp_id = 'IF'.
    gs_data-color = 'C110'."'C710'.
    gs_data-zxbrl = 'Y1800'.
    DO 11 TIMES.
      lv_count = sy-index.

      ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE <fs_data> TO <fs_data_val>.
      ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE <fs_sum>  TO <fs_sum_val>.
      ASSIGN COMPONENT |B{ lv_count ALPHA = IN }| OF STRUCTURE gs_data   TO <fs_out_val>.

      IF <fs_data_val> <= 0.
        <fs_out_val> = '0.00'.
      ELSE.
        TRY.
            <fs_out_val> = ( <fs_sum_val> / <fs_data_val> ) * 100.
          CATCH cx_sy_zerodivide.
            <fs_out_val> = '0.00'.
        ENDTRY.
      ENDIF.
    ENDDO.
    APPEND gs_data TO gt_data.
    CLEAR:gs_data.
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
    IF <fs_data>-zint_split = 'X'.
      <fs_data>-color = 'C101'.
    ENDIF.
    "" Character to Amount Conversion
    PERFORM convert_char_to_amt USING <fs_data>-b01 CHANGING <fs_data>-cb01.

    PERFORM convert_char_to_amt USING <fs_data>-b02 CHANGING <fs_data>-cb02.

    PERFORM convert_char_to_amt USING <fs_data>-b03 CHANGING <fs_data>-cb03.

    PERFORM convert_char_to_amt USING <fs_data>-b04 CHANGING <fs_data>-cb04.

    PERFORM convert_char_to_amt USING <fs_data>-b05 CHANGING <fs_data>-cb05.

    PERFORM convert_char_to_amt USING <fs_data>-b06 CHANGING <fs_data>-cb06.

    PERFORM convert_char_to_amt USING <fs_data>-b07 CHANGING <fs_data>-cb07.

    PERFORM convert_char_to_amt USING <fs_data>-b08 CHANGING <fs_data>-cb08.

    PERFORM convert_char_to_amt USING <fs_data>-b09 CHANGING <fs_data>-cb09.

    PERFORM convert_char_to_amt USING <fs_data>-b10 CHANGING <fs_data>-cb10.

    PERFORM convert_char_to_amt USING <fs_data>-b11 CHANGING <fs_data>-cb11.

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
*&---------------------------------------------------------------------*
*& Form fetch_txn_type
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
*& -->  p1        text
*& <--  p2        text
*&---------------------------------------------------------------------*
FORM fetch_txn_type .
  SPLIT <fs_data>-zttype AT ',' INTO DATA(lv_ttyp1) DATA(lv_ttyp2) DATA(lv_ttyp3) DATA(lv_ttyp4) DATA(lv_ttyp5) DATA(lv_ttyp6) DATA(lv_ttyp7) DATA(lv_ttyp8) DATA(lv_ttyp9) DATA(lv_ttyp10).
  rt_ttyp = VALUE #( sign = 'I' option = 'EQ' ( low = lv_ttyp1 )
                                              ( low = lv_ttyp2 )
                                              ( low = lv_ttyp3 )
                                              ( low = lv_ttyp4 )
                                              ( low = lv_ttyp5 )
                                              ( low = lv_ttyp6 )
                                              ( low = lv_ttyp7 )
                                              ( low = lv_ttyp8 )
                                              ( low = lv_ttyp9 )
                                              ( low = lv_ttyp10 ) ).

  DELETE rt_ttyp WHERE low IS INITIAL.
ENDFORM.