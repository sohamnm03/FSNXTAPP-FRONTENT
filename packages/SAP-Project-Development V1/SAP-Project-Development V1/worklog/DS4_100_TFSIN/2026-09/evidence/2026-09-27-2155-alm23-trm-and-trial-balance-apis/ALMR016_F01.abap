*&---------------------------------------------------------------------*
*& Include          /FS00/ALMR016_F01
*&---------------------------------------------------------------------*
*&---------------------------------------------------------------------*
*& Form get_data
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM get_data .
  SELECT *
    FROM /fs00/almtr018
    INTO TABLE gt_data.

  SELECT a~saknr,
    a~txt20,
    a~txt50
    FROM skat AS a
    INNER JOIN t001 AS b
    ON b~ktopl EQ a~ktopl
    INTO CORRESPONDING FIELDS OF TABLE @gt_skat
    WHERE b~bukrs EQ @p_bukrs
    AND a~spras EQ @sy-langu.

  SELECT *
    FROM /fs00/almtr002
    INTO CORRESPONDING FIELDS OF TABLE @gt_grp.

  SELECT *
    FROM /fs00/almtr003
    INTO CORRESPONDING FIELDS OF TABLE @gt_grp3.

  SELECT *
    FROM /fs00/almtr005
    INTO CORRESPONDING FIELDS OF TABLE @gt_bkt.

  SELECT *
    FROM /fs00/almtr008
    INTO CORRESPONDING FIELDS OF TABLE @gt_src.

  gt_display = CORRESPONDING #( gt_data MAPPING gl_id        = zgl_id
                                                gl_desc      = zgl_desc
                                                gr_id        = zgr_id
                                                gr_desc      = zgr_desc
                                                cal_id       = zcal
                                                cal_desc     = zcal_desc
                                                bu_id        = zbu_id
                                                bu_desc      = zbu_desc
                                                type         = ztype3
                                                alm3_grp     = zgrp_id
                                                alm3_grpdesc = zgrp_name ).
  gt_display = VALUE #( BASE gt_display FOR i = 1 UNTIL i > 20 ( ) ).
ENDFORM.
*&---------------------------------------------------------------------*
*& Form display
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM display .
  gs_layout-cwidth_opt = abap_true.

  gt_fcat = VALUE lvc_t_fcat(
    ( fieldname = 'GL_ID'        scrtext_l = 'G/L Code'               ref_field = 'SAKNR'   ref_table = 'SKA1' edit = abap_true )
    ( fieldname = 'GL_DESC'      scrtext_l = 'G/L Description'        outputlen = 50 )
    ( fieldname = 'GR_ID'        scrtext_l = 'ALM2 Group Code'        edit      = abap_true outputlen = 20 )
    ( fieldname = 'GR_DESC'      scrtext_l = 'ALM2 Group Description' outputlen = 30 )
    ( fieldname = 'CAL_ID'       scrtext_l = 'Source'                 edit      = abap_true )
    ( fieldname = 'CAL_DESC'     scrtext_l = 'Source Description'     outputlen = 30 )
    ( fieldname = 'BU_ID'        scrtext_l = 'Bucket'                 edit      = abap_true )
    ( fieldname = 'BU_DESC'      scrtext_l = 'Bucket Description'     outputlen = 30 )
    ( fieldname = 'TYPE'         scrtext_l = 'Type'                   edit      = abap_true )
    ( fieldname = 'ALM3_GRP'     scrtext_l = 'ALM3 Group Code'        edit      = abap_true outputlen = 20 )
    ( fieldname = 'ALM3_GRPDESC' scrtext_l = 'ALM3 Group Description' outputlen = 30 )
  ).

  CALL FUNCTION 'REUSE_ALV_GRID_DISPLAY_LVC'
    EXPORTING
      i_callback_program       = sy-cprog
      i_callback_pf_status_set = 'ZSTATUS'
      i_callback_user_command  = 'USR_CMD'
      i_callback_top_of_page   = 'TOP_PAGE'
      i_html_height_top        = 18
      is_layout_lvc            = gs_layout
      it_fieldcat_lvc          = gt_fcat
      i_default                = abap_true
      i_save                   = 'A'
      is_variant               = gs_variant
    TABLES
      t_outtab                 = gt_display
    EXCEPTIONS
      program_error            = 1
      OTHERS                   = 2.
ENDFORM.
FORM usr_cmd USING     r_ucomm LIKE sy-ucomm
                   rs_selfield TYPE slis_selfield.
  CASE r_ucomm.
    WHEN '&DATA_SAVE' OR '&REF'.
      CALL FUNCTION 'GET_GLOBALS_FROM_SLVC_FULLSCR'
        IMPORTING
          e_grid = gt_grid.
      CALL METHOD gt_grid->check_changed_data
        IMPORTING
          e_valid = is_valid.
      IF is_valid = 'X'.
        SELECT * FROM /fs00/almtr018 INTO TABLE gt_data1 ." WHERE bukrs = p_bukrs
        "AND   zmonth = p_month AND   zyear  = p_year.
      ENDIF.
      LOOP AT gt_display ASSIGNING FIELD-SYMBOL(<fs_display>).
        CLEAR gs_data1.
        IF <fs_display>-gl_id IS NOT INITIAL.
          gs_data1 = CORRESPONDING #( <fs_display> MAPPING zgl_id    = gl_id
                                                           zgr_id    = gr_id
                                                           zcal      = cal_id
                                                           zbu_id    = bu_id
                                                           ztype3    = type
                                                           zgrp_id   = alm3_grp
                                                           zgrp_name = alm3_grpdesc ).
          <fs_display>-gl_desc = gs_data1-zgl_desc = COND #( WHEN <fs_display>-gl_desc IS INITIAL THEN VALUE #( gt_skat[ saknr = gs_data1-zgl_id ]-txt50 OPTIONAL )
                                                               ELSE <fs_display>-gl_desc ).

          <fs_display>-gr_desc = gs_data1-zgr_desc = COND #( WHEN <fs_display>-gr_desc IS INITIAL THEN VALUE #( gt_grp[ zgrp_id = gs_data1-zgr_id ]-zgrp_name OPTIONAL )
                                                               ELSE <fs_display>-gr_desc ).

          <fs_display>-alm3_grpdesc = gs_data1-zgrp_name = COND #( WHEN <fs_display>-alm3_grpdesc IS INITIAL THEN VALUE #( gt_grp3[ zgrp_id = gs_data1-zgrp_id ]-zgrp_name OPTIONAL )
                                                                     ELSE <fs_display>-alm3_grpdesc ).

          <fs_display>-cal_desc = gs_data1-zcal_desc = COND #( WHEN <fs_display>-cal_desc IS INITIAL THEN VALUE #( gt_src[ zsrc = gs_data1-zcal ]-zsrc_desc OPTIONAL )
                                                                 ELSE <fs_display>-cal_desc ).

          <fs_display>-bu_desc = gs_data1-zbu_desc = COND #( WHEN <fs_display>-bu_desc IS INITIAL THEN VALUE #( gt_bkt[ zbuc = gs_data1-zbu_id ]-zdesc OPTIONAL )
                                                               ELSE <fs_display>-bu_desc ).
          IF r_ucomm = '&DATA_SAVE'.
            MODIFY /fs00/almtr018 FROM gs_data1.
            COMMIT WORK.
          ENDIF.
        ENDIF.
      ENDLOOP.
      MESSAGE 'Manual Entry Details Update Successfully ' TYPE 'S'.
      rs_selfield-refresh = abap_true.
  ENDCASE.
ENDFORM.                    "user_command
FORM top_page.
  SELECT SINGLE butxt
    INTO @DATA(lv_butxt)
    FROM t001
    WHERE bukrs = @p_bukrs.

  DATA(lt_header) = VALUE slis_t_listheader(
    ( typ = 'H' info = lv_butxt )
    ( typ = 'H' info = 'ALM - GL Mapping Table' )
  ).

  CALL FUNCTION 'REUSE_ALV_COMMENTARY_WRITE'
    EXPORTING
      it_list_commentary = lt_header.
ENDFORM.
FORM zstatus USING p_extab TYPE slis_t_extab.
  SET PF-STATUS 'ZSTATUS' .
ENDFORM.
