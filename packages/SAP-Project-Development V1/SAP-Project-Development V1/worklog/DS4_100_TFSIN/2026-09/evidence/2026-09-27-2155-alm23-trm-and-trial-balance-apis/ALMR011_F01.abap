*&---------------------------------------------------------------------*
*& Include          /FS00/ALMR011_F01
*&---------------------------------------------------------------------*
*&---------------------------------------------------------------------*
*& Form get_data
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM get_data .
  CALL FUNCTION 'TEXT_CONVERT_XLS_TO_SAP'
    EXPORTING
*     I_FIELD_SEPERATOR    =
      i_line_header        = 'X'
      i_tab_raw_data       = gt_raw
      i_filename           = p_file
    TABLES
      i_tab_converted_data = gt_data
    EXCEPTIONS
      conversion_failed    = 1
      OTHERS               = 2.

  IF sy-subrc <> 0.
*      MESSAGE 'FILE NOT FOUND' TYPE 'E'.
    MESSAGE ID sy-msgid
          TYPE sy-msgty
          NUMBER sy-msgno
          WITH sy-msgv1 sy-msgv2 sy-msgv3 sy-msgv4.
  ENDIF.
  SELECT *
    FROM /fs00/almtr002
    INTO CORRESPONDING FIELDS OF TABLE @gt_tr002.
ENDFORM.
*&---------------------------------------------------------------------*
*& Form process_data
*&---------------------------------------------------------------------*
*& text
*&---------------------------------------------------------------------*
FORM process_data .
  gt_final = CORRESPONDING #( gt_data ).
  LOOP AT gt_final ASSIGNING FIELD-SYMBOL(<fs_final>).
    <fs_final>-zgl_id = |{ <fs_final>-zgl_id ALPHA = IN }|.
    <fs_final>-zgr_desc = VALUE #( gt_tr002[ zgrp_id = <fs_final>-zgr_id ]-zgrp_name OPTIONAL ).
    <fs_final>-zcreated_by = sy-uname.
    <fs_final>-zcreated_date = sy-datum.
    <fs_final>-zcreated_time = sy-uzeit.
    <fs_final>-zchanged_by = sy-uname.
    <fs_final>-zchanged_date = sy-datum.
    <fs_final>-zchanged_time = sy-uzeit.
  ENDLOOP.
  IF gt_final IS NOT INITIAL.
    MODIFY /fs00/almtr018 FROM TABLE gt_final.
    IF sy-subrc = 0.
      COMMIT WORK AND WAIT.
      MESSAGE 'ALM2 / ALM3 GL Mapping Data Uploaded Successfully' TYPE 'S'.
    ENDIF.
  ENDIF.
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
