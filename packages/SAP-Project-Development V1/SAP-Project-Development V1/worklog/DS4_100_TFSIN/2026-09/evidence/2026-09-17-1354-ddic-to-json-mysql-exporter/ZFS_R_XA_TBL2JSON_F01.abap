*&---------------------------------------------------------------------*
*& Include ZFS_R_XA_TBL2JSON_F01
*&---------------------------------------------------------------------*
*& Processing. All of the work belongs to ZCL_FS_XA_TBL2JSON; this include
*& only collects the selection screen input, shows the result and saves it.
*&---------------------------------------------------------------------*

CLASS lcl_app DEFINITION FINAL CREATE PRIVATE.

  PUBLIC SECTION.
    CLASS-METHODS run.
    CLASS-METHODS pick_file.

  PRIVATE SECTION.
    CLASS-METHODS collect_tables
      RETURNING VALUE(rt_tabnames) TYPE zcl_fs_xa_tbl2json=>ty_tabnames.

    CLASS-METHODS display
      IMPORTING it_json TYPE string_table.

    CLASS-METHODS download
      IMPORTING it_json TYPE string_table.

ENDCLASS.


CLASS lcl_app IMPLEMENTATION.

  METHOD run.

    DATA(lo_exporter) = NEW zcl_fs_xa_tbl2json( ).
    DATA(lt_json)     = lo_exporter->export( collect_tables( ) ).

    IF p_show = abap_true.
      display( lt_json ).
    ENDIF.

    IF p_down = abap_true.
      download( lt_json ).
    ENDIF.

  ENDMETHOD.


  METHOD collect_tables.

    " NO INTERVALS leaves every row as a single value in LOW. Duplicates are
    " dropped so the same table cannot appear twice in one document.
    LOOP AT s_tab INTO DATA(ls_range).
      IF ls_range-low IS NOT INITIAL.
        APPEND ls_range-low TO rt_tabnames.
      ENDIF.
    ENDLOOP.

    SORT rt_tabnames AS TEXT.
    DELETE ADJACENT DUPLICATES FROM rt_tabnames.

  ENDMETHOD.


  METHOD display.

    LOOP AT it_json INTO DATA(lv_line).
      WRITE / lv_line.
    ENDLOOP.

  ENDMETHOD.


  METHOD download.

    IF p_file IS INITIAL.
      WRITE / 'No file name given - nothing was saved.' ##NO_TEXT.
      RETURN.
    ENDIF.

    DATA lt_data TYPE string_table.
    lt_data = it_json.

    " Codepage 4110 is UTF-8, which is what a MySQL loader expects. No byte
    " order mark: many JSON parsers treat one as a syntax error.
    cl_gui_frontend_services=>gui_download(
      EXPORTING  filename = p_file
                 filetype = 'ASC'
                 codepage = '4110'
                 write_lf = abap_true
      CHANGING   data_tab = lt_data
      EXCEPTIONS OTHERS   = 1 ).

    IF sy-subrc = 0.
      WRITE: / 'Saved', lines( it_json ), 'lines to', p_file ##NO_TEXT.
    ELSE.
      WRITE: / 'Download failed, sy-subrc =', sy-subrc ##NO_TEXT.
    ENDIF.

  ENDMETHOD.


  METHOD pick_file.

    DATA lv_filename TYPE string.
    DATA lv_path     TYPE string.
    DATA lv_fullpath TYPE string.

    cl_gui_frontend_services=>file_save_dialog(
      EXPORTING  default_extension = 'json'
                 default_file_name = 'sap_tables.json'
      CHANGING   filename          = lv_filename
                 path              = lv_path
                 fullpath          = lv_fullpath
      EXCEPTIONS OTHERS            = 1 ).

    IF sy-subrc = 0 AND lv_fullpath IS NOT INITIAL.
      p_file = lv_fullpath.
    ENDIF.

  ENDMETHOD.

ENDCLASS.