*&---------------------------------------------------------------------*
*& Include          /FS00/ALMR024_F01
*&---------------------------------------------------------------------*
*&---------------------------------------------------------------------*
*& Form get_data
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM get_data .
  DATA: lr_flgl TYPE RANGE OF saknr.
  gr_src = VALUE #( sign = 'I' option = 'EQ' ( low = '59' )
                                             ( low = '60' ) ).
  lr_flgl = VALUE #( sign = 'I' option = 'EQ' ( low = '0010501022' )
                                              ( low = '0010501026' )
                                              ( low = '0010501027' ) ).
  gv_amt_div = COND #( WHEN rb1 EQ abap_true THEN 10000000
                        WHEN rb2 EQ abap_true THEN 100000
                        WHEN rb3 EQ abap_true THEN 1000
                        WHEN rb4 EQ abap_true THEN 1
                        ELSE 1 ).
  SELECT *
    FROM /fs00/almtr028
    INTO CORRESPONDING FIELDS OF TABLE @gt_data
    WHERE zbukrs EQ @p_bukrs
    AND zmonth EQ @p_month
    AND zyear EQ @p_year.

  IF gt_data IS INITIAL.
    MESSAGE 'No Provisions Data Found' TYPE 'S' DISPLAY LIKE 'E'.
    LEAVE LIST-PROCESSING.
  ENDIF.

  SELECT zsrc,
    zsrc_desc
    FROM /fs00/almtr008
    APPENDING CORRESPONDING FIELDS OF TABLE @gt_data
    WHERE zsrc IN @gr_src.

  SELECT *
    FROM /fs00/almtr027
    INTO CORRESPONDING FIELDS OF TABLE @gt_tr027
    WHERE zbukrs EQ @p_bukrs
      AND zmonth EQ @p_month
      AND zyear EQ @p_year.

  IF gt_tr027 IS INITIAL.
    MESSAGE 'Update FL Bucketing First' TYPE 'S' DISPLAY LIKE 'W'.
  ENDIF.

  LOOP AT gt_data ASSIGNING FIELD-SYMBOL(<fs_data>).
    CASE <fs_data>-zsrc.
      WHEN '59'.
        LOOP AT gt_data INTO DATA(ls_data) WHERE zsrc EQ '52' OR zsrc EQ '58'.
          <fs_data>-zbukrs = ls_data-zbukrs.
          <fs_data>-zmonth = ls_data-zmonth.
          <fs_data>-zyear  = ls_data-zyear.
          <fs_data>-zbuc1  += ls_data-zbuc1.
          <fs_data>-zbuc2  += ls_data-zbuc2.
          <fs_data>-zbuc3  += ls_data-zbuc3.
          <fs_data>-zbuc4  += ls_data-zbuc4.
          <fs_data>-zbuc5  += ls_data-zbuc5.
          <fs_data>-zbuc6  += ls_data-zbuc6.
          <fs_data>-zbuc7  += ls_data-zbuc7.
          <fs_data>-zbuc8  += ls_data-zbuc8.
          <fs_data>-zbuc9  += ls_data-zbuc9.
          <fs_data>-zbuc10 += ls_data-zbuc10.
        ENDLOOP.
        READ TABLE gt_tr027 INTO DATA(ls_tr027) WITH KEY zgl = '0010501020'.
        IF sy-subrc = 0.
          <fs_data>-zbuc1  += ls_tr027-zbuc1.
          <fs_data>-zbuc2  += ls_tr027-zbuc2.
          <fs_data>-zbuc3  += ls_tr027-zbuc3.
          <fs_data>-zbuc4  += ls_tr027-zbuc4.
          <fs_data>-zbuc5  += ls_tr027-zbuc5.
          <fs_data>-zbuc6  += ls_tr027-zbuc6.
          <fs_data>-zbuc7  += ls_tr027-zbuc7.
          <fs_data>-zbuc8  += ls_tr027-zbuc8.
          <fs_data>-zbuc9  += ls_tr027-zbuc9.
          <fs_data>-zbuc10 += ls_tr027-zbuc10.
        ENDIF.
      WHEN '60'.
        LOOP AT gt_data INTO ls_data WHERE zsrc EQ '51' OR zsrc EQ '57'.
          <fs_data>-zbukrs = ls_data-zbukrs.
          <fs_data>-zmonth = ls_data-zmonth.
          <fs_data>-zyear  = ls_data-zyear.
          <fs_data>-zbuc1  += ls_data-zbuc1.
          <fs_data>-zbuc2  += ls_data-zbuc2.
          <fs_data>-zbuc3  += ls_data-zbuc3.
          <fs_data>-zbuc4  += ls_data-zbuc4.
          <fs_data>-zbuc5  += ls_data-zbuc5.
          <fs_data>-zbuc6  += ls_data-zbuc6.
          <fs_data>-zbuc7  += ls_data-zbuc7.
          <fs_data>-zbuc8  += ls_data-zbuc8.
          <fs_data>-zbuc9  += ls_data-zbuc9.
          <fs_data>-zbuc10 += ls_data-zbuc10.
        ENDLOOP.
        LOOP AT gt_tr027 INTO ls_tr027 WHERE zgl IN lr_flgl.
          <fs_data>-zbuc1  += ls_tr027-zbuc1.
          <fs_data>-zbuc2  += ls_tr027-zbuc2.
          <fs_data>-zbuc3  += ls_tr027-zbuc3.
          <fs_data>-zbuc4  += ls_tr027-zbuc4.
          <fs_data>-zbuc5  += ls_tr027-zbuc5.
          <fs_data>-zbuc6  += ls_tr027-zbuc6.
          <fs_data>-zbuc7  += ls_tr027-zbuc7.
          <fs_data>-zbuc8  += ls_tr027-zbuc8.
          <fs_data>-zbuc9  += ls_tr027-zbuc9.
          <fs_data>-zbuc10 += ls_tr027-zbuc10.
        ENDLOOP.
    ENDCASE.
  ENDLOOP.
  LOOP AT gt_data ASSIGNING FIELD-SYMBOL(<fs_data1>).
    PERFORM amt_conv CHANGING <fs_data1>.
  ENDLOOP.

ENDFORM.
*&---------------------------------------------------------------------*
*& Form display
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM display .
  CALL FUNCTION 'LVC_FIELDCATALOG_MERGE'
    EXPORTING
      i_structure_name       = '/FS00/ALMTR028'
    CHANGING
      ct_fieldcat            = gt_fcat
    EXCEPTIONS
      inconsistent_interface = 1
      program_error          = 2
      OTHERS                 = 3.
  IF sy-subrc <> 0.
* Implement suitable error handling here
  ELSE.
    DELETE gt_fcat WHERE fieldname CP 'ZCREATED_*' OR fieldname CP 'ZCHANGED_*'.
    LOOP AT gt_fcat ASSIGNING FIELD-SYMBOL(<fs_fcat>) WHERE fieldname CP 'ZBUC*'.
      <fs_fcat>-no_zero = abap_true.
      CLEAR: <fs_fcat>-scrtext_s, <fs_fcat>-ref_table.
      CASE <fs_fcat>-fieldname.
        WHEN 'ZBUC1'.
          <fs_fcat>-scrtext_l =  <fs_fcat>-scrtext_m = <fs_fcat>-reptext = '1 Day to 7 Days'.
        WHEN 'ZBUC2'.
          <fs_fcat>-scrtext_l =  <fs_fcat>-scrtext_m = <fs_fcat>-reptext = '8 Days to 14 Days'.
        WHEN 'ZBUC3'.
          <fs_fcat>-scrtext_l =  <fs_fcat>-scrtext_m = <fs_fcat>-reptext = '15 Days to 1 Month'.
        WHEN 'ZBUC4'.
          <fs_fcat>-scrtext_l =  <fs_fcat>-scrtext_m = <fs_fcat>-reptext = '1 Month to 2 Months' .
        WHEN 'ZBUC5'.
          <fs_fcat>-scrtext_l =  <fs_fcat>-scrtext_m = <fs_fcat>-reptext = '2 Months to 3 Months'.
        WHEN 'ZBUC6'.
          <fs_fcat>-scrtext_l =  <fs_fcat>-scrtext_m = <fs_fcat>-reptext = '3 Months to 6 Months'.
        WHEN 'ZBUC7'.
          <fs_fcat>-scrtext_l =  <fs_fcat>-scrtext_m = <fs_fcat>-reptext = '7 Months to 12 Months'.
        WHEN 'ZBUC8'.
          <fs_fcat>-scrtext_l =  <fs_fcat>-scrtext_m = <fs_fcat>-reptext = '1 Year to 3 Years'.
        WHEN 'ZBUC9'.
          <fs_fcat>-scrtext_l =  <fs_fcat>-scrtext_m = <fs_fcat>-reptext = '3 Years to 5 Years'.
        WHEN 'ZBUC10'.
          <fs_fcat>-scrtext_l =  <fs_fcat>-scrtext_m = <fs_fcat>-reptext = 'Over 5 Years'.
      ENDCASE.
    ENDLOOP.
    gs_layout-cwidth_opt = abap_true.
    gs_layout-zebra = abap_true.
    CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY_LVC'
      EXPORTING
        i_callback_program       = sy-cprog
        i_callback_user_command  = 'USR_CMD'
        i_callback_top_of_page   = 'TOP_PAGE'
        i_callback_pf_status_set = 'ZSTATUS'
        i_html_height_top        = 22
        is_layout_lvc            = gs_layout
        it_fieldcat_lvc          = gt_fcat
        i_default                = abap_true
        i_save                   = 'A'
        is_variant               = gs_variant
      TABLES
        t_outtab                 = gt_data
      EXCEPTIONS
        program_error            = 1
        OTHERS                   = 2.
  ENDIF.
ENDFORM.
*&---------------------------------------------------------------------*
*&      Form  TOP_PAGE
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
FORM top_page .
  DATA :lv_butxt  TYPE butxt.
  SELECT SINGLE butxt FROM t001 INTO @lv_butxt WHERE bukrs = @p_bukrs.
  DATA(lt_header) = VALUE slis_t_listheader(
    ( typ = 'H' info = 'Display Provisions Data' )
    ( typ = 'S' key  = 'Company:' info = |{ lv_butxt }| )
    ( typ = 'S' key  = 'Month:'   info = |{ p_month }| )
    ( typ = 'S' key  = 'Year:'    info = |{ p_year }| )
    ( typ = 'S' key  = 'Amount:'  info = 'In Lakhs' )
  ).
  CALL FUNCTION 'REUSE_ALV_COMMENTARY_WRITE'
    EXPORTING
      it_list_commentary = lt_header[].
ENDFORM.
*&---------------------------------------------------------------------*
*& Form USR_CMD
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM usr_cmd USING r_ucomm LIKE sy-ucomm rs_selfield TYPE slis_selfield.
  CASE r_ucomm.
    WHEN '&FL_UPD'.
      CALL SCREEN 9000 STARTING AT 5 5.
      PERFORM get_data.
      rs_selfield-refresh = abap_true.
  ENDCASE.
ENDFORM.
*&---------------------------------------------------------------------*
*& Form sub_get_layout
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM sub_get_layout .
  gs_variant-report   = sy-repid.
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
*&      Form  ZSTATUS
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
FORM zstatus USING p_extab TYPE slis_t_extab.
  SET PF-STATUS 'ZSTATUS' .
ENDFORM.
*&---------------------------------------------------------------------*
*& Form amt_conv
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM amt_conv CHANGING p_data TYPE /fs00/almtr028.
  IF p_data-zsrc IN gr_src.
    TRY.
        p_data-zbuc1  = abs( p_data-zbuc1 ) / gv_amt_div.
        p_data-zbuc2  = abs( p_data-zbuc2 ) / gv_amt_div.
        p_data-zbuc3  = abs( p_data-zbuc3 ) / gv_amt_div.
        p_data-zbuc4  = abs( p_data-zbuc4 ) / gv_amt_div.
        p_data-zbuc5  = abs( p_data-zbuc5 ) / gv_amt_div.
        p_data-zbuc6  = abs( p_data-zbuc6 ) / gv_amt_div.
        p_data-zbuc7  = abs( p_data-zbuc7 ) / gv_amt_div.
        p_data-zbuc8  = abs( p_data-zbuc8 ) / gv_amt_div.
        p_data-zbuc9  = abs( p_data-zbuc9 ) / gv_amt_div.
        p_data-zbuc10 = abs( p_data-zbuc10 ) / gv_amt_div.
      CATCH cx_root.
    ENDTRY.
  ELSE.
    TRY.
        p_data-zbuc1  = p_data-zbuc1 / gv_amt_div.
        p_data-zbuc2  = p_data-zbuc2 / gv_amt_div.
        p_data-zbuc3  = p_data-zbuc3 / gv_amt_div.
        p_data-zbuc4  = p_data-zbuc4 / gv_amt_div.
        p_data-zbuc5  = p_data-zbuc5 / gv_amt_div.
        p_data-zbuc6  = p_data-zbuc6 / gv_amt_div.
        p_data-zbuc7  = p_data-zbuc7 / gv_amt_div.
        p_data-zbuc8  = p_data-zbuc8 / gv_amt_div.
        p_data-zbuc9  = p_data-zbuc9 / gv_amt_div.
        p_data-zbuc10 = p_data-zbuc10 / gv_amt_div.
      CATCH cx_root.
    ENDTRY.
  ENDIF.
ENDFORM.