*&---------------------------------------------------------------------*
*& Report ZFS_R_XA_DDIC2JSON
*&---------------------------------------------------------------------*
*& Exports the DDIC definition of one or more tables as JSON, so that a
*& converter outside SAP can generate a MySQL CREATE TABLE from it.
*&
*& Every field is reported twice: the raw SAP facts (data type, length,
*& decimals) and a suggested MySQL column type. The consumer can trust the
*& suggestion or re-derive its own from the raw facts.
*&
*& Self-contained on purpose: no includes and no global class, so the whole
*& thing can be pasted into SE38 on any system and run.
*&
*&   LCL_EXPORTER - reads the dictionary and builds the JSON
*&   LCL_APP      - selection screen plumbing, display and download
*&---------------------------------------------------------------------*
REPORT zfs_r_xa_ddic2json LINE-SIZE 255.

*---------------------------------------------------------------------*
* Selection screen
*---------------------------------------------------------------------*
" Only a type carrier for the select-option; the report never reads this table.
DATA gv_tabname TYPE tabname.

SELECTION-SCREEN BEGIN OF BLOCK b01 WITH FRAME TITLE TEXT-b01.
" NO INTERVALS on purpose: a list of table names, not a range. A range would
" have to be resolved against the dictionary, which this report has no business
" querying.
SELECT-OPTIONS s_tab FOR gv_tabname NO INTERVALS OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b01.

SELECTION-SCREEN BEGIN OF BLOCK b02 WITH FRAME TITLE TEXT-b02.
PARAMETERS p_show AS CHECKBOX DEFAULT 'X'.
PARAMETERS p_down AS CHECKBOX DEFAULT 'X'.
PARAMETERS p_file TYPE string LOWER CASE DEFAULT 'C:\temp\sap_tables.json'.
SELECTION-SCREEN END OF BLOCK b02.


*---------------------------------------------------------------------*
* LCL_EXPORTER - dictionary to JSON
*---------------------------------------------------------------------*
CLASS lcl_exporter DEFINITION FINAL CREATE PUBLIC.

  PUBLIC SECTION.

    TYPES ty_tabnames TYPE STANDARD TABLE OF tabname WITH EMPTY KEY.

    METHODS export
      IMPORTING it_tabnames    TYPE ty_tabnames
      RETURNING VALUE(rt_json) TYPE string_table.

    METHODS map_sap_to_mysql
      IMPORTING iv_datatype    TYPE dfies-datatype
                iv_length      TYPE i
                iv_decimals    TYPE i
      RETURNING VALUE(rv_type) TYPE string.

    METHODS mysql_note
      IMPORTING iv_datatype    TYPE dfies-datatype
      RETURNING VALUE(rv_note) TYPE string.

  PRIVATE SECTION.

    " MySQL caps a whole row at 65535 bytes, so a very wide SAP character field
    " cannot stay a VARCHAR. Anything above this becomes TEXT instead.
    CONSTANTS c_varchar_max TYPE i VALUE 4000.

    METHODS append_table
      IMPORTING iv_tabname TYPE tabname
                iv_last    TYPE abap_bool
      CHANGING  ct_out     TYPE string_table.

    METHODS append_field
      IMPORTING is_field TYPE dfies
                iv_last  TYPE abap_bool
      CHANGING  ct_out   TYPE string_table.

    METHODS ddic_field_list
      IMPORTING iv_tabname TYPE tabname
      EXPORTING et_fields  TYPE ddfields
                ev_error   TYPE string.

    METHODS table_description
      IMPORTING iv_tabname     TYPE tabname
      RETURNING VALUE(rv_text) TYPE string.

    METHODS escape
      IMPORTING iv_value        TYPE clike
      RETURNING VALUE(rv_value) TYPE string.

    METHODS iso_timestamp
      RETURNING VALUE(rv_stamp) TYPE string.

ENDCLASS.


*---------------------------------------------------------------------*
* LCL_APP - selection screen, display, download
*---------------------------------------------------------------------*
CLASS lcl_app DEFINITION FINAL CREATE PRIVATE.

  PUBLIC SECTION.
    CLASS-METHODS run.
    CLASS-METHODS pick_file.

  PRIVATE SECTION.
    CLASS-METHODS collect_tables
      RETURNING VALUE(rt_tabnames) TYPE lcl_exporter=>ty_tabnames.

    CLASS-METHODS display
      IMPORTING it_json TYPE string_table.

    CLASS-METHODS download
      IMPORTING it_json TYPE string_table.

ENDCLASS.


CLASS lcl_exporter IMPLEMENTATION.


  METHOD export.

    APPEND `{` TO rt_json.
    APPEND |  "generatedAt": "{ iso_timestamp( ) }",| TO rt_json.
    APPEND |  "source": \{ "systemId": "{ escape( sy-sysid ) }", "client": "{ escape( sy-mandt ) }" \},| TO rt_json.
    APPEND `  "conventions": {` TO rt_json.
    APPEND `    "lengthUnit": "characters",` TO rt_json.
    APPEND `    "nullability": "SAP transparent table columns are never NULL - every column carries an initial value, so all columns are reported NOT NULL",` TO rt_json.
    APPEND `    "includes": "DDIC .INCLUDE and append structures are flattened into the field list"` TO rt_json.
    APPEND `  },` TO rt_json.
    APPEND `  "tables": [` TO rt_json.

    DATA(lv_count) = lines( it_tabnames ).
    LOOP AT it_tabnames INTO DATA(lv_tabname).
      append_table(
        EXPORTING iv_tabname = lv_tabname
                  iv_last    = xsdbool( sy-tabix = lv_count )
        CHANGING  ct_out     = rt_json ).
    ENDLOOP.

    APPEND `  ]` TO rt_json.
    APPEND `}` TO rt_json.

  ENDMETHOD.


  METHOD append_table.

    DATA(lv_comma) = COND string( WHEN iv_last = abap_true THEN `` ELSE `,` ).

    ddic_field_list(
      EXPORTING iv_tabname = iv_tabname
      IMPORTING et_fields  = DATA(lt_fields)
                ev_error   = DATA(lv_error) ).

    APPEND `    {` TO ct_out.
    APPEND |      "name": "{ escape( iv_tabname ) }",| TO ct_out.

    " A bad table name is reported inside the document rather than dumping, so
    " one typo in a list of twenty still yields nineteen usable definitions.
    IF lv_error IS NOT INITIAL.
      APPEND |      "error": "{ escape( lv_error ) }",| TO ct_out.
      APPEND `      "fields": []` TO ct_out.
      APPEND |    \}{ lv_comma }| TO ct_out.
      RETURN.
    ENDIF.

    APPEND |      "description": "{ escape( table_description( iv_tabname ) ) }",| TO ct_out.

    " Primary key in DDIC field order - the order is part of the key.
    DATA lt_key TYPE string_table.
    CLEAR lt_key.
    LOOP AT lt_fields INTO DATA(ls_key) WHERE keyflag = abap_true.
      APPEND |"{ escape( ls_key-fieldname ) }"| TO lt_key.
    ENDLOOP.
    DATA lv_key TYPE string.
    CLEAR lv_key.
    CONCATENATE LINES OF lt_key INTO lv_key SEPARATED BY `, `.
    APPEND |      "primaryKey": [{ lv_key }],| TO ct_out.

    APPEND `      "fields": [` TO ct_out.
    DATA(lv_count) = lines( lt_fields ).
    LOOP AT lt_fields INTO DATA(ls_field).
      append_field(
        EXPORTING is_field = ls_field
                  iv_last  = xsdbool( sy-tabix = lv_count )
        CHANGING  ct_out   = ct_out ).
    ENDLOOP.
    APPEND `      ]` TO ct_out.

    APPEND |    \}{ lv_comma }| TO ct_out.

  ENDMETHOD.


  METHOD append_field.

    DATA(lv_comma)    = COND string( WHEN iv_last = abap_true THEN `` ELSE `,` ).
    DATA(lv_length)   = CONV i( is_field-leng ).
    DATA(lv_decimals) = CONV i( is_field-decimals ).
    DATA(lv_outlen)   = CONV i( is_field-outputlen ).
    DATA(lv_position) = CONV i( is_field-position ).
    DATA(lv_mysql)    = map_sap_to_mysql( iv_datatype = is_field-datatype
                                          iv_length   = lv_length
                                          iv_decimals = lv_decimals ).
    DATA(lv_note)     = mysql_note( is_field-datatype ).
    DATA(lv_iskey)    = COND string( WHEN is_field-keyflag = abap_true THEN `true` ELSE `false` ).

    APPEND `        {` TO ct_out.
    APPEND |          "name": "{ escape( is_field-fieldname ) }",| TO ct_out.
    APPEND |          "position": { lv_position },| TO ct_out.
    APPEND |          "isKey": { lv_iskey },| TO ct_out.
    APPEND |          "description": "{ escape( is_field-fieldtext ) }",| TO ct_out.
    APPEND |          "dataElement": "{ escape( is_field-rollname ) }",| TO ct_out.
    APPEND |          "domain": "{ escape( is_field-domname ) }",| TO ct_out.
    APPEND |          "checkTable": "{ escape( is_field-checktable ) }",| TO ct_out.

    " CURR needs its currency key and QUAN its unit: without the referenced
    " column the number is meaningless, so carry the reference across.
    APPEND |          "referenceField": \{ "table": "{ escape( is_field-reftable ) }", "field": "{ escape( is_field-reffield ) }" \},| TO ct_out.

    APPEND |          "sap": \{ "dataType": "{ escape( is_field-datatype ) }", "length": { lv_length }, "decimals": { lv_decimals }, "outputLength": { lv_outlen } \},| TO ct_out.

    IF lv_note IS INITIAL.
      APPEND |          "mysql": \{ "type": "{ escape( lv_mysql ) }", "nullable": false \}| TO ct_out.
    ELSE.
      APPEND |          "mysql": \{ "type": "{ escape( lv_mysql ) }", "nullable": false, "note": "{ escape( lv_note ) }" \}| TO ct_out.
    ENDIF.

    APPEND |        \}{ lv_comma }| TO ct_out.

  ENDMETHOD.


  METHOD map_sap_to_mysql.

    DATA(lv_len) = COND i( WHEN iv_length > 0 THEN iv_length ELSE 255 ).

    CASE iv_datatype.

        " ---- character-like -------------------------------------------------
      WHEN 'CHAR' OR 'VARC' OR 'LCHR' OR 'SSTR'.
        rv_type = COND string( WHEN lv_len > c_varchar_max THEN `TEXT`
                               ELSE |VARCHAR({ lv_len })| ).
      WHEN 'CLNT'.
        rv_type = `CHAR(3)`.
      WHEN 'LANG'.
        rv_type = `CHAR(1)`.
      WHEN 'CUKY'.
        rv_type = `CHAR(5)`.
      WHEN 'UNIT'.
        rv_type = |CHAR({ lv_len })|.

        " NUMC is digits held as characters, and its leading zeros are
        " significant - document numbers, ALPHA-converted keys. An INT column
        " would silently eat them.
      WHEN 'NUMC'.
        rv_type = |VARCHAR({ lv_len })|.

        " ---- date and time --------------------------------------------------
      WHEN 'DATS'.
        rv_type = `DATE`.
      WHEN 'TIMS'.
        rv_type = `TIME`.

        " ---- numeric --------------------------------------------------------
        " DEC/CURR/QUAN are exact decimals. Never FLOAT: an amount that loses
        " precision on the way out of SAP is a defect, not a rounding detail.
      WHEN 'DEC' OR 'CURR' OR 'QUAN'.
        rv_type = |DECIMAL({ lv_len },{ iv_decimals })|.
      WHEN 'FLTP'.
        rv_type = `DOUBLE`.
      WHEN 'INT1'.
        rv_type = `TINYINT UNSIGNED`.
      WHEN 'INT2'.
        rv_type = `SMALLINT`.
      WHEN 'INT4'.
        rv_type = `INT`.
      WHEN 'INT8'.
        rv_type = `BIGINT`.
      WHEN 'PREC'.
        rv_type = `SMALLINT`.
      WHEN 'D16D' OR 'D16R' OR 'D16S' OR 'D34D' OR 'D34R' OR 'D34S'.
        rv_type = `DOUBLE`.

        " ---- binary and large objects ---------------------------------------
      WHEN 'RAW'.
        rv_type = |VARBINARY({ lv_len })|.
      WHEN 'LRAW' OR 'RSTR'.
        rv_type = `LONGBLOB`.
      WHEN 'STRG'.
        rv_type = `LONGTEXT`.

      WHEN OTHERS.
        rv_type = |VARCHAR({ lv_len })|.

    ENDCASE.

  ENDMETHOD.


  METHOD mysql_note.

    CASE iv_datatype.
      WHEN 'NUMC'.
        rv_note = `Digits stored as text; leading zeros are significant. Do not load into an integer column.`.
      WHEN 'DATS'.
        rv_note = `SAP initial date 00000000 has no DATE equivalent - map it to NULL on load.`.
      WHEN 'TIMS'.
        rv_note = `SAP initial time 000000 is a legitimate midnight value, not a null.`.
      WHEN 'CURR'.
        rv_note = `Amount - read the currency from the column named in referenceField.`.
      WHEN 'QUAN'.
        rv_note = `Quantity - read the unit of measure from the column named in referenceField.`.
      WHEN 'D16D' OR 'D16R' OR 'D16S' OR 'D34D' OR 'D34R' OR 'D34S'.
        rv_note = `SAP decfloat mapped to DOUBLE, which is lossy. Use DECIMAL with a known scale if precision matters.`.
      WHEN 'LCHR' OR 'LRAW'.
        rv_note = `Long field - in SAP it is preceded by a length field, which is not part of the value.`.
      WHEN OTHERS.
        CLEAR rv_note.
    ENDCASE.

  ENDMETHOD.


  METHOD ddic_field_list.

    CLEAR: et_fields, ev_error.

    " DESCRIBE_BY_NAME still declares a classic exception, so it is called the
    " classic way on purpose - a functional call could not report a bad name.
    DATA lo_type TYPE REF TO cl_abap_typedescr.
    CALL METHOD cl_abap_typedescr=>describe_by_name
      EXPORTING  p_name         = iv_tabname
      RECEIVING  p_descr_ref    = lo_type
      EXCEPTIONS type_not_found = 1
                 OTHERS         = 2.
    IF sy-subrc <> 0.
      ev_error = |No DDIC type found for { iv_tabname }|.
      RETURN.
    ENDIF.

    DATA lo_struct TYPE REF TO cl_abap_structdescr.
    TRY.
        lo_struct = CAST cl_abap_structdescr( lo_type ).
      CATCH cx_sy_move_cast_error.
        ev_error = |{ iv_tabname } is not a structured type - it cannot become a MySQL table|.
        RETURN.
    ENDTRY.

    TRY.
        " abap_true flattens .INCLUDE and append structures into one flat list,
        " which is exactly what a MySQL CREATE TABLE needs.
        et_fields = lo_struct->get_ddic_field_list( p_including_substructres = abap_true ).
      CATCH cx_root INTO DATA(lx_error).
        ev_error = |Field list unavailable for { iv_tabname }: { lx_error->get_text( ) }|.
    ENDTRY.

  ENDMETHOD.


  METHOD table_description.

    " Best effort and deliberately isolated: the short text is decoration,
    " nothing in the field mapping depends on it, so a failure here must never
    " fail the export.
    TRY.
        rv_text = xco_cp_abap_dictionary=>database_table(
                      CONV sxco_dbt_object_name( iv_tabname ) )->content( )->get_short_description( ).
      CATCH cx_root.
        CLEAR rv_text.
    ENDTRY.

    IF rv_text IS NOT INITIAL.
      RETURN.
    ENDIF.

    " Measured, not assumed: XCO returned an empty short description for T000
    " on this release, so fall back to the dictionary's own reader, which also
    " honours the logon language.
    DATA ls_header TYPE dd02v.
    CALL FUNCTION 'DDIF_TABL_GET'
      EXPORTING  name          = iv_tabname
                 langu         = sy-langu
      IMPORTING  dd02v_wa      = ls_header
      EXCEPTIONS illegal_input = 1
                 OTHERS        = 2.
    IF sy-subrc = 0.
      rv_text = ls_header-ddtext.
    ENDIF.

  ENDMETHOD.


  METHOD escape.

    rv_value = iv_value.
    " Backslash first, or every escape introduced below gets escaped again.
    REPLACE ALL OCCURRENCES OF `\` IN rv_value WITH `\\`.
    REPLACE ALL OCCURRENCES OF `"` IN rv_value WITH `\"`.
    REPLACE ALL OCCURRENCES OF cl_abap_char_utilities=>cr_lf IN rv_value WITH `\n`.
    REPLACE ALL OCCURRENCES OF cl_abap_char_utilities=>newline IN rv_value WITH `\n`.
    REPLACE ALL OCCURRENCES OF cl_abap_char_utilities=>horizontal_tab IN rv_value WITH `\t`.

  ENDMETHOD.


  METHOD iso_timestamp.

    DATA lv_stamp TYPE timestamp.
    GET TIME STAMP FIELD lv_stamp.
    rv_stamp = |{ lv_stamp TIMESTAMP = ISO }Z|.

  ENDMETHOD.


ENDCLASS.


CLASS lcl_app IMPLEMENTATION.

  METHOD run.

    DATA(lo_exporter) = NEW lcl_exporter( ).
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


*---------------------------------------------------------------------*
* Events
*---------------------------------------------------------------------*
AT SELECTION-SCREEN ON VALUE-REQUEST FOR p_file.
  lcl_app=>pick_file( ).

START-OF-SELECTION.
  lcl_app=>run( ).