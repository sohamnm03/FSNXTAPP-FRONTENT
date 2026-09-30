*&---------------------------------------------------------------------*
*& Include /FS00/ALMR024_9000
*&---------------------------------------------------------------------*

*&SPWIZARD: OUTPUT MODULE FOR TC 'TC_FL'. DO NOT CHANGE THIS LINE!
*&SPWIZARD: UPDATE LINES FOR EQUIVALENT SCROLLBAR
MODULE tc_fl_change_tc_attr OUTPUT.
  DESCRIBE TABLE gt_fltc LINES tc_fl-lines.
ENDMODULE.

*&SPWIZARD: OUTPUT MODULE FOR TC 'TC_FL'. DO NOT CHANGE THIS LINE!
*&SPWIZARD: GET LINES OF TABLECONTROL
MODULE tc_fl_get_lines OUTPUT.
  g_tc_fl_lines = sy-loopc.
ENDMODULE.

*&SPWIZARD: INPUT MODULE FOR TC 'TC_FL'. DO NOT CHANGE THIS LINE!
*&SPWIZARD: MODIFY TABLE
MODULE tc_fl_modify INPUT.
  gs_fltc-ztotal = gs_fltc-zbuc1 + gs_fltc-zbuc2 + gs_fltc-zbuc3 + gs_fltc-zbuc4 + gs_fltc-zbuc5
                 + gs_fltc-zbuc6 + gs_fltc-zbuc7 + gs_fltc-zbuc8 + gs_fltc-zbuc9 + gs_fltc-zbuc10.
  MODIFY gt_fltc
    FROM gs_fltc
    INDEX tc_fl-current_line.
ENDMODULE.

*&SPWIZARD: INPUT MODUL FOR TC 'TC_FL'. DO NOT CHANGE THIS LINE!
*&SPWIZARD: MARK TABLE
MODULE tc_fl_mark INPUT.
  DATA: g_tc_fl_wa2 LIKE LINE OF gt_fltc.
  IF tc_fl-line_sel_mode = 1
  AND gs_fltc-mark = 'X'.
    LOOP AT gt_fltc INTO g_tc_fl_wa2
      WHERE mark = 'X'.
      g_tc_fl_wa2-mark = ''.
      MODIFY gt_fltc
        FROM g_tc_fl_wa2
        TRANSPORTING mark.
    ENDLOOP.
  ENDIF.
  MODIFY gt_fltc
    FROM gs_fltc
    INDEX tc_fl-current_line
    TRANSPORTING mark.
ENDMODULE.

*&SPWIZARD: INPUT MODULE FOR TC 'TC_FL'. DO NOT CHANGE THIS LINE!
*&SPWIZARD: PROCESS USER COMMAND
MODULE tc_fl_user_command INPUT.
  ok_code = sy-ucomm.
  PERFORM user_ok_tc USING    'TC_FL'
                              'GT_FLTC'
                              'MARK'
                     CHANGING ok_code.
  sy-ucomm = ok_code.
ENDMODULE.

*----------------------------------------------------------------------*
*   INCLUDE TABLECONTROL_FORMS                                         *
*----------------------------------------------------------------------*

*&---------------------------------------------------------------------*
*&      Form  USER_OK_TC                                               *
*&---------------------------------------------------------------------*
FORM user_ok_tc USING    p_tc_name TYPE dynfnam
                         p_table_name
                         p_mark_name
                CHANGING p_ok      LIKE sy-ucomm.

*&SPWIZARD: BEGIN OF LOCAL DATA----------------------------------------*
  DATA: l_ok     TYPE sy-ucomm,
        l_offset TYPE i.
*&SPWIZARD: END OF LOCAL DATA------------------------------------------*

*&SPWIZARD: Table control specific operations                          *
*&SPWIZARD: evaluate TC name and operations                            *
  SEARCH p_ok FOR p_tc_name.
  IF sy-subrc <> 0.
    EXIT.
  ENDIF.
  l_offset = strlen( p_tc_name ) + 1.
  l_ok = p_ok+l_offset.
*&SPWIZARD: execute general and TC specific operations                 *
  CASE l_ok.
    WHEN 'INSR'.                      "insert row
      PERFORM fcode_insert_row USING    p_tc_name
                                        p_table_name.
      CLEAR p_ok.

    WHEN 'DELE'.                      "delete row
      PERFORM fcode_delete_row USING    p_tc_name
                                        p_table_name
                                        p_mark_name.
      CLEAR p_ok.

    WHEN 'P--' OR                     "top of list
         'P-'  OR                     "previous page
         'P+'  OR                     "next page
         'P++'.                       "bottom of list
      PERFORM compute_scrolling_in_tc USING p_tc_name
                                            l_ok.
      CLEAR p_ok.
*     WHEN 'L--'.                       "total left
*       PERFORM FCODE_TOTAL_LEFT USING P_TC_NAME.
*
*     WHEN 'L-'.                        "column left
*       PERFORM FCODE_COLUMN_LEFT USING P_TC_NAME.
*
*     WHEN 'R+'.                        "column right
*       PERFORM FCODE_COLUMN_RIGHT USING P_TC_NAME.
*
*     WHEN 'R++'.                       "total right
*       PERFORM FCODE_TOTAL_RIGHT USING P_TC_NAME.
*
    WHEN 'MARK'.                      "mark all filled lines
      PERFORM fcode_tc_mark_lines USING p_tc_name
                                        p_table_name
                                        p_mark_name   .
      CLEAR p_ok.

    WHEN 'DMRK'.                      "demark all filled lines
      PERFORM fcode_tc_demark_lines USING p_tc_name
                                          p_table_name
                                          p_mark_name .
      CLEAR p_ok.

*     WHEN 'SASCEND'   OR
*          'SDESCEND'.                  "sort column
*       PERFORM FCODE_SORT_TC USING P_TC_NAME
*                                   l_ok.

  ENDCASE.

ENDFORM.                              " USER_OK_TC

*&---------------------------------------------------------------------*
*&      Form  FCODE_INSERT_ROW                                         *
*&---------------------------------------------------------------------*
FORM fcode_insert_row
              USING    p_tc_name           TYPE dynfnam
                       p_table_name             .

*&SPWIZARD: BEGIN OF LOCAL DATA----------------------------------------*
  DATA l_lines_name       LIKE feld-name.
  DATA l_selline          LIKE sy-stepl.
  DATA l_lastline         TYPE i.
  DATA l_line             TYPE i.
  DATA l_table_name       LIKE feld-name.
  FIELD-SYMBOLS <tc>                 TYPE cxtab_control.
  FIELD-SYMBOLS <table>              TYPE STANDARD TABLE.
  FIELD-SYMBOLS <lines>              TYPE i.
*&SPWIZARD: END OF LOCAL DATA------------------------------------------*

  ASSIGN (p_tc_name) TO <tc>.

*&SPWIZARD: get the table, which belongs to the tc                     *
  CONCATENATE p_table_name '[]' INTO l_table_name. "table body
  ASSIGN (l_table_name) TO <table>.                "not headerline

*&SPWIZARD: get looplines of TableControl                              *
  CONCATENATE 'G_' p_tc_name '_LINES' INTO l_lines_name.
  ASSIGN (l_lines_name) TO <lines>.

*&SPWIZARD: get current line                                           *
  GET CURSOR LINE l_selline.
  IF sy-subrc <> 0.                   " append line to table
    l_selline = <tc>-lines + 1.
*&SPWIZARD: set top line                                               *
    IF l_selline > <lines>.
      <tc>-top_line = l_selline - <lines> + 1 .
    ELSE.
      <tc>-top_line = 1.
    ENDIF.
  ELSE.                               " insert line into table
    l_selline = <tc>-top_line + l_selline - 1.
    l_lastline = <tc>-top_line + <lines> - 1.
  ENDIF.
*&SPWIZARD: set new cursor line                                        *
  l_line = l_selline - <tc>-top_line + 1.

*&SPWIZARD: insert initial line                                        *
  INSERT INITIAL LINE INTO <table> INDEX l_selline.
  <tc>-lines = <tc>-lines + 1.
*&SPWIZARD: set cursor                                                 *
  SET CURSOR 1 l_line.

ENDFORM.                              " FCODE_INSERT_ROW

*&---------------------------------------------------------------------*
*&      Form  FCODE_DELETE_ROW                                         *
*&---------------------------------------------------------------------*
FORM fcode_delete_row
              USING    p_tc_name           TYPE dynfnam
                       p_table_name
                       p_mark_name   .

*&SPWIZARD: BEGIN OF LOCAL DATA----------------------------------------*
  DATA l_table_name       LIKE feld-name.

  FIELD-SYMBOLS <tc>         TYPE cxtab_control.
  FIELD-SYMBOLS <table>      TYPE STANDARD TABLE.
  FIELD-SYMBOLS <wa>.
  FIELD-SYMBOLS <mark_field>.
*&SPWIZARD: END OF LOCAL DATA------------------------------------------*

  ASSIGN (p_tc_name) TO <tc>.

*&SPWIZARD: get the table, which belongs to the tc                     *
  CONCATENATE p_table_name '[]' INTO l_table_name. "table body
  ASSIGN (l_table_name) TO <table>.                "not headerline

*&SPWIZARD: delete marked lines                                        *
  DESCRIBE TABLE <table> LINES <tc>-lines.

  LOOP AT <table> ASSIGNING <wa>.

*&SPWIZARD: access to the component 'FLAG' of the table header         *
    ASSIGN COMPONENT p_mark_name OF STRUCTURE <wa> TO <mark_field>.

    IF <mark_field> = 'X'.
      DELETE <table> INDEX syst-tabix.
      IF sy-subrc = 0.
        <tc>-lines = <tc>-lines - 1.
      ENDIF.
    ENDIF.
  ENDLOOP.

ENDFORM.                              " FCODE_DELETE_ROW

*&---------------------------------------------------------------------*
*&      Form  COMPUTE_SCROLLING_IN_TC
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
*      -->P_TC_NAME  name of tablecontrol
*      -->P_OK       ok code
*----------------------------------------------------------------------*
FORM compute_scrolling_in_tc USING    p_tc_name
                                      p_ok.
*&SPWIZARD: BEGIN OF LOCAL DATA----------------------------------------*
  DATA l_tc_new_top_line     TYPE i.
  DATA l_tc_name             LIKE feld-name.
  DATA l_tc_lines_name       LIKE feld-name.
  DATA l_tc_field_name       LIKE feld-name.

  FIELD-SYMBOLS <tc>         TYPE cxtab_control.
  FIELD-SYMBOLS <lines>      TYPE i.
*&SPWIZARD: END OF LOCAL DATA------------------------------------------*

  ASSIGN (p_tc_name) TO <tc>.
*&SPWIZARD: get looplines of TableControl                              *
  CONCATENATE 'G_' p_tc_name '_LINES' INTO l_tc_lines_name.
  ASSIGN (l_tc_lines_name) TO <lines>.


*&SPWIZARD: is no line filled?                                         *
  IF <tc>-lines = 0.
*&SPWIZARD: yes, ...                                                   *
    l_tc_new_top_line = 1.
  ELSE.
*&SPWIZARD: no, ...                                                    *
    CALL FUNCTION 'SCROLLING_IN_TABLE'
      EXPORTING
        entry_act      = <tc>-top_line
        entry_from     = 1
        entry_to       = <tc>-lines
        last_page_full = 'X'
        loops          = <lines>
        ok_code        = p_ok
        overlapping    = 'X'
      IMPORTING
        entry_new      = l_tc_new_top_line
      EXCEPTIONS
*       NO_ENTRY_OR_PAGE_ACT  = 01
*       NO_ENTRY_TO    = 02
*       NO_OK_CODE_OR_PAGE_GO = 03
        OTHERS         = 0.
  ENDIF.

*&SPWIZARD: get actual tc and column                                   *
  GET CURSOR FIELD l_tc_field_name
             AREA  l_tc_name.

  IF syst-subrc = 0.
    IF l_tc_name = p_tc_name.
*&SPWIZARD: et actual column                                           *
      SET CURSOR FIELD l_tc_field_name LINE 1.
    ENDIF.
  ENDIF.

*&SPWIZARD: set the new top line                                       *
  <tc>-top_line = l_tc_new_top_line.


ENDFORM.                              " COMPUTE_SCROLLING_IN_TC

*&---------------------------------------------------------------------*
*&      Form  FCODE_TC_MARK_LINES
*&---------------------------------------------------------------------*
*       marks all TableControl lines
*----------------------------------------------------------------------*
*      -->P_TC_NAME  name of tablecontrol
*----------------------------------------------------------------------*
FORM fcode_tc_mark_lines USING p_tc_name
                               p_table_name
                               p_mark_name.
*&SPWIZARD: EGIN OF LOCAL DATA-----------------------------------------*
  DATA l_table_name       LIKE feld-name.

  FIELD-SYMBOLS <tc>         TYPE cxtab_control.
  FIELD-SYMBOLS <table>      TYPE STANDARD TABLE.
  FIELD-SYMBOLS <wa>.
  FIELD-SYMBOLS <mark_field>.
*&SPWIZARD: END OF LOCAL DATA------------------------------------------*

  ASSIGN (p_tc_name) TO <tc>.

*&SPWIZARD: get the table, which belongs to the tc                     *
  CONCATENATE p_table_name '[]' INTO l_table_name. "table body
  ASSIGN (l_table_name) TO <table>.                "not headerline

*&SPWIZARD: mark all filled lines                                      *
  LOOP AT <table> ASSIGNING <wa>.

*&SPWIZARD: access to the component 'FLAG' of the table header         *
    ASSIGN COMPONENT p_mark_name OF STRUCTURE <wa> TO <mark_field>.

    <mark_field> = 'X'.
  ENDLOOP.
ENDFORM.                                          "fcode_tc_mark_lines

*&---------------------------------------------------------------------*
*&      Form  FCODE_TC_DEMARK_LINES
*&---------------------------------------------------------------------*
*       demarks all TableControl lines
*----------------------------------------------------------------------*
*      -->P_TC_NAME  name of tablecontrol
*----------------------------------------------------------------------*
FORM fcode_tc_demark_lines USING p_tc_name
                                 p_table_name
                                 p_mark_name .
*&SPWIZARD: BEGIN OF LOCAL DATA----------------------------------------*
  DATA l_table_name       LIKE feld-name.

  FIELD-SYMBOLS <tc>         TYPE cxtab_control.
  FIELD-SYMBOLS <table>      TYPE STANDARD TABLE.
  FIELD-SYMBOLS <wa>.
  FIELD-SYMBOLS <mark_field>.
*&SPWIZARD: END OF LOCAL DATA------------------------------------------*

  ASSIGN (p_tc_name) TO <tc>.

*&SPWIZARD: get the table, which belongs to the tc                     *
  CONCATENATE p_table_name '[]' INTO l_table_name. "table body
  ASSIGN (l_table_name) TO <table>.                "not headerline

*&SPWIZARD: demark all filled lines                                    *
  LOOP AT <table> ASSIGNING <wa>.

*&SPWIZARD: access to the component 'FLAG' of the table header         *
    ASSIGN COMPONENT p_mark_name OF STRUCTURE <wa> TO <mark_field>.

    <mark_field> = space.
  ENDLOOP.
ENDFORM.                                          "fcode_tc_mark_lines
*&---------------------------------------------------------------------*
*& Module STATUS_9000 OUTPUT
*&---------------------------------------------------------------------*
*&
*&---------------------------------------------------------------------*
MODULE status_9000 OUTPUT.
  SET PF-STATUS 'ZSTATUS_POPUP'.
  SET TITLEBAR 'AAA'.

  PERFORM get_fl_data.
ENDMODULE.
*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_9000  INPUT
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
MODULE user_command_9000 INPUT.
  DATA: lv_exit TYPE i.
  CASE sy-ucomm.
    WHEN '&ONT'.
      PERFORM exit_check CHANGING lv_exit.
    WHEN '&SAVE'.
      PERFORM exit_check CHANGING lv_exit.
      IF lv_exit EQ 0.
        PERFORM save_data.
      ENDIF.
  ENDCASE.
  IF lv_exit IS INITIAL.
    LEAVE TO SCREEN 0.
  ELSE.
    MESSAGE 'Please Match Total and GL Balance' TYPE 'S' DISPLAY LIKE 'E'.
  ENDIF.
ENDMODULE.
*&---------------------------------------------------------------------*
*&      Module  USER_COMMAND_9000_EXIT  INPUT
*&---------------------------------------------------------------------*
*       text
*----------------------------------------------------------------------*
MODULE user_command_9000_exit INPUT.
  CASE sy-ucomm.
    WHEN 'BACK' OR 'EXIT' OR 'CANCEL' OR '&AC1'.
      LEAVE TO SCREEN 0.
  ENDCASE.
ENDMODULE.
*&---------------------------------------------------------------------*
*& Form get_fl_data
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM get_fl_data.
  IF gt_fltc IS INITIAL.
    gt_fltc = VALUE #( ( zgl = '0010501020' )
                       ( zgl = '0010501022' )
                       ( zgl = '0010501026' )
                       ( zgl = '0010501027' ) ).
    SELECT a~saknr,
      a~txt50
      FROM skat AS a
      INNER JOIN t001 AS b
      ON b~ktopl EQ a~ktopl
      INTO CORRESPONDING FIELDS OF TABLE @gt_skat
      WHERE b~bukrs EQ @p_bukrs
      AND a~spras EQ @sy-langu.
  ENDIF.
  SELECT *
    FROM /fs00/almtr027
    INTO CORRESPONDING FIELDS OF TABLE @gt_tr027
    FOR ALL ENTRIES IN @gt_fltc
    WHERE zgl EQ @gt_fltc-zgl
      AND zbukrs EQ @p_bukrs
      AND zmonth EQ @p_month
      AND zyear EQ @p_year.
  PERFORM get_gl_balances.
  LOOP AT gt_fltc ASSIGNING FIELD-SYMBOL(<fs_fltc>).
    <fs_fltc>-zgl = |{ <fs_fltc>-zgl ALPHA = IN }|.
    <fs_fltc>-zgl_desc = VALUE #( gt_skat[ saknr = <fs_fltc>-zgl ]-txt50 OPTIONAL ).
    <fs_fltc>-zbukrs = p_bukrs.
    <fs_fltc>-zmonth = p_month.
    <fs_fltc>-zyear  = p_year.

    READ TABLE gt_tr027 INTO DATA(ls_tr027) WITH KEY zgl = <fs_fltc>-zgl.
    IF sy-subrc = 0.
      <fs_fltc> = CORRESPONDING #( ls_tr027 ).
    ENDIF.

    READ TABLE gt_gl INTO DATA(ls_gl) WITH KEY bukrs = <fs_fltc>-zbukrs saknr = <fs_fltc>-zgl.
    IF sy-subrc = 0.
      <fs_fltc>-zgl_balance = ls_gl-acytd_bal.
    ENDIF.
    <fs_fltc>-zgl = |{ <fs_fltc>-zgl ALPHA = OUT }|.
  ENDLOOP.
ENDFORM.
*&---------------------------------------------------------------------*
*& Form exit_check
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM exit_check CHANGING p_exit TYPE i.
  CLEAR: p_exit.
  LOOP AT gt_fltc ASSIGNING FIELD-SYMBOL(<fs_fltc>).
*    IF <fs_fltc>-zgl_balance NE <fs_fltc>-ztotal.
*    IF round( val = <fs_fltc>-zgl_balance dec = 0 ) NE round( val = <fs_fltc>-ztotal dec = 0 ).
*      p_exit += 1.
*    ENDIF.
  ENDLOOP.
ENDFORM.
*&---------------------------------------------------------------------*
*& Form get_gl_balances
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM get_gl_balances .
  DATA: lr_gl     TYPE RANGE OF hkont,
        lr_bukrs  TYPE RANGE OF bukrs,
        lr_year   TYPE RANGE OF gjahr,
        lr_period TYPE RANGE OF allgbmon,
        f_year    TYPE n LENGTH 4,
        f_month   TYPE n LENGTH 2,
        lv_sdate  TYPE dats.
  " Get Fiscal Month and Year for G/L Acct Balances
  lv_sdate = |{ p_year }{ p_month }01|.
  CALL FUNCTION 'FTI_FISCAL_YEAR_MONTH_GET'
    EXPORTING
      i_bukrs = p_bukrs
      i_budat = lv_sdate
    IMPORTING
      e_gjahr = f_year
      e_monat = f_month.
  lr_bukrs  = VALUE #( sign = 'I' option = 'EQ' ( low = p_bukrs ) ).
  lr_year = VALUE #( sign = 'I' option = 'EQ' ( low = f_year ) ).
  lr_period = VALUE #( sign = 'I' option = 'BT' ( low = f_month high = f_month ) ).
  lr_gl = VALUE #( FOR ls IN gt_fltc ( sign = 'I' option = 'EQ' low = ls-zgl ) ) .
  cl_salv_bs_runtime_info=>set( EXPORTING display  = abap_false
                                          metadata = abap_false
                                          data     = abap_true ).
  SUBMIT rfssld00 WITH sd_bukrs IN lr_bukrs
                   WITH sd_gjahr IN lr_year
                   WITH sd_saknr IN lr_gl
                   WITH b_monate IN lr_period
                   WITH par_lis1 = abap_true
                   WITH par_lis2 = abap_true
                   EXPORTING LIST TO MEMORY AND RETURN.
  TRY.
      cl_salv_bs_runtime_info=>get_data_ref( IMPORTING r_data = gt_gld ).
      IF gt_gld IS NOT INITIAL.
        ASSIGN gt_gld->* TO <fs_dat>.
        MOVE-CORRESPONDING <fs_dat> TO gt_gl.
      ELSE.
        MESSAGE TEXT-008 TYPE 'S' DISPLAY LIKE 'E'.
        LEAVE LIST-PROCESSING.
      ENDIF.
    CATCH cx_salv_bs_sc_runtime_info.
  ENDTRY.
  cl_salv_bs_runtime_info=>clear_all( ).
  cl_salv_bs_runtime_info=>set( EXPORTING display  = abap_true
                                          metadata = abap_true
                                          data     = abap_true ).
  SORT gt_gl BY bukrs saknr ASCENDING.
ENDFORM.
*&---------------------------------------------------------------------*
*& Form save_data
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM save_data .
  gt_tr027 = CORRESPONDING #( gt_fltc ).
  LOOP AT gt_tr027 ASSIGNING FIELD-SYMBOL(<fs_tr027>).
    <fs_tr027>-zgl = |{ <fs_tr027>-zgl ALPHA = IN }|.
    <fs_tr027>-zcreated_by = sy-uname.
    <fs_tr027>-zcreated_date = sy-datum.
    <fs_tr027>-zcreated_time = sy-uzeit.
    <fs_tr027>-zchanged_by = sy-uname.
    <fs_tr027>-zchanged_date = sy-datum.
    <fs_tr027>-zchanged_time = sy-uzeit.
  ENDLOOP.
  IF gt_tr027 IS NOT INITIAL.
    MODIFY /fs00/almtr027 FROM TABLE gt_tr027.
    IF sy-subrc = 0.
      COMMIT WORK AND WAIT.
    ENDIF.
  ENDIF.
ENDFORM.