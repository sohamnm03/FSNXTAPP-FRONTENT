CLASS zcl_fs_xa_tbl2json DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.

    INTERFACES if_oo_adt_classrun.

    TYPES ty_tabnames TYPE STANDARD TABLE OF tabname WITH EMPTY KEY.

    "! Describes the given DDIC tables as a JSON document.
    "! Field types are reported twice: the raw SAP facts, and a suggested MySQL
    "! column type, so an external converter can trust the suggestion or re-derive it.
    METHODS export
      IMPORTING it_tabnames    TYPE ty_tabnames
      RETURNING VALUE(rt_json) TYPE string_table.

    "! Same document as EXPORT, concatenated into one string.
    METHODS export_as_string
      IMPORTING it_tabnames    TYPE ty_tabnames
      RETURNING VALUE(rv_json) TYPE string.

    "! Maps one SAP DDIC type to a MySQL column type.
    "! Public so the mapping can be exercised on its own, without a table.
    METHODS map_sap_to_mysql
      IMPORTING iv_datatype    TYPE dfies-datatype
                iv_length      TYPE i
                iv_decimals    TYPE i
      RETURNING VALUE(rv_type) TYPE string.

    "! Caveat for mappings that are lossy or need a decision downstream.
    "! Empty when the mapping is exact.
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


CLASS zcl_fs_xa_tbl2json IMPLEMENTATION.


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


  METHOD export_as_string.

    DATA(lt_lines) = export( it_tabnames ).
    CONCATENATE LINES OF lt_lines INTO rv_json
                SEPARATED BY cl_abap_char_utilities=>newline.

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


  METHOD if_oo_adt_classrun~main.

    TYPES: BEGIN OF ty_probe,
             datatype TYPE dfies-datatype,
             length   TYPE i,
             decimals TYPE i,
           END OF ty_probe,
           ty_probes TYPE STANDARD TABLE OF ty_probe WITH EMPTY KEY.

    " Two self-checks, so the class can be proved from the ADT console without
    " a selection screen: real tables end to end, then the whole type map.
    " MARA is in the list because it exercises QUAN, UNIT, DATS, NUMC and RAW,
    " which T000 does not.
    DATA(lt_tabnames) = VALUE ty_tabnames( ( 'T000' ) ( 'MARA' ) ( 'NO_SUCH_TABLE' ) ).
    DATA(lt_json)     = export( lt_tabnames ).

    out->write( `=== JSON ===` ).
    LOOP AT lt_json INTO DATA(lv_line).
      out->write( lv_line ).
    ENDLOOP.

    out->write( `=== END JSON ===` ).
    out->write( `=== SAP -> MySQL type map ===` ).

    DATA(lt_probe) = VALUE ty_probes(
      ( datatype = 'CHAR' length = 20   decimals = 0 )
      ( datatype = 'CHAR' length = 9000 decimals = 0 )
      ( datatype = 'NUMC' length = 10   decimals = 0 )
      ( datatype = 'CLNT' length = 3    decimals = 0 )
      ( datatype = 'LANG' length = 1    decimals = 0 )
      ( datatype = 'CUKY' length = 5    decimals = 0 )
      ( datatype = 'UNIT' length = 3    decimals = 0 )
      ( datatype = 'DATS' length = 8    decimals = 0 )
      ( datatype = 'TIMS' length = 6    decimals = 0 )
      ( datatype = 'DEC'  length = 15   decimals = 2 )
      ( datatype = 'CURR' length = 23   decimals = 2 )
      ( datatype = 'QUAN' length = 13   decimals = 3 )
      ( datatype = 'FLTP' length = 16   decimals = 16 )
      ( datatype = 'INT1' length = 3    decimals = 0 )
      ( datatype = 'INT2' length = 5    decimals = 0 )
      ( datatype = 'INT4' length = 10   decimals = 0 )
      ( datatype = 'INT8' length = 19   decimals = 0 )
      ( datatype = 'RAW'  length = 16   decimals = 0 )
      ( datatype = 'RSTR' length = 0    decimals = 0 )
      ( datatype = 'STRG' length = 0    decimals = 0 )
      ( datatype = 'SSTR' length = 40   decimals = 0 )
      ( datatype = 'D34D' length = 34   decimals = 0 ) ).

    LOOP AT lt_probe INTO DATA(ls_probe).
      out->write( |{ ls_probe-datatype WIDTH = 6 } len={ ls_probe-length WIDTH = 5 } | &&
                  |dec={ ls_probe-decimals WIDTH = 3 } -> | &&
                  |{ map_sap_to_mysql( iv_datatype = ls_probe-datatype
                                       iv_length   = ls_probe-length
                                       iv_decimals = ls_probe-decimals ) }| ).
    ENDLOOP.

  ENDMETHOD.


ENDCLASS.