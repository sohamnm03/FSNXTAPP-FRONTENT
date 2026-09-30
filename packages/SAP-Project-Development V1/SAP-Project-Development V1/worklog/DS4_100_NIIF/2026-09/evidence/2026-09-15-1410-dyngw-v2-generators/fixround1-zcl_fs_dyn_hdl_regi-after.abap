**********************************************************************
* REGI - register an allow-list target as a step.
*
* The allow-list rows are application data and do NOT travel with the
* transport (L-335): a freshly imported system answers 017 to
* everything until targets are registered on it. Doing that one POST
* per target is slow and not atomic; as a step kind, a whole system is
* one ExecuteBatch and CommitMode makes it all-or-nothing.
*
* WHAT KEEPS IT SAFE
*
* 1. Self-protection first (039). The framework's own tables and RFC
*    modules can never become dispatch targets, whatever the payload
*    says. It is the one refusal no registry row, no operation and no
*    authorization can influence, so it runs before anything else can
*    pass and make it reachable. The three patterns and the upper-case
*    left-shift normalisation are deliberately identical to
*    ZCL_FS_DYN_HDL_TABLE=>REJECT_OWN_OBJECT and to Task 4's
*    VALIDATETARGET: a name must not be reachable through one door and
*    refused at the other.
* 2. INSERT is the default and fails on an existing target with 035.
*    Widening a registration - flipping IS_ACTIVE back on, raising a
*    MAX_ROWS ceiling - has to be typed out as UPDATE (L-344). That
*    check is made HERE, at application level, by reading first. It is
*    not left to the unique index KND: a duplicate that reaches the
*    database surfaces as a short dump or an update-task failure, not
*    as a usable error, and the index's rejection behaviour has never
*    been exercised on this system.
* 3. An UPDATE touches only the columns the caller actually sent. The
*    omitted ones keep their committed values instead of being blanked,
*    which is what a partial payload means - and blanking them is how
*    you silently widen, or silently disable, a live registration.
*    A key that is not a column at all is REFUSED, by name (034); see
*    APPLY_PAYLOAD for why silence there was the worse answer.
* 4. A SUBM target is qualified before it is admitted (043): it must
*    exist in TRDIR, be an executable report, and reference no CL_GUI_*
*    control. A GUI report in the GUI-less execution session kills the
*    work process and surfaces as "connection closed (no data)"
*    (L-321/L-329/L-331). Refusing at registration time puts the failure
*    where it can be explained.
* 5. REGI itself is not a registrable TargetKind (034). It is a step
*    kind; a row saying otherwise would be a second, contradictory
*    answer to "who may register".
* 6. Every registration writes a ZFS_T_DYN_REGH row with SOURCE 'REGI',
*    the request's call UUID and a before/after image. A change to the
*    security boundary is the last thing that should be invisible.
* 7. The handler holds no SQL. ZCL_FS_DYN_REGISTRY is its database door,
*    exactly as ZIF_FS_DYN_RUNTIME is the other four handlers'.
*
* The two Operations do different jobs, and both reuse fields that
* already exist rather than adding any: the STEP's Operation is
* INSERT / UPDATE / UPSERT, exactly as TABL uses it; the one inside
* ImportJson is the registration's own OPERATION column, the operation
* the registered target will be pinned to.
*
* 2026-09-15 fix round 1 (Task 8 criterion 11 / L-517): ALLOWGEN and
* GENNROBJECT added to TY_PAYLOAD and APPLY_PAYLOAD's accepted-key
* CASE. Tasks 3 and 7 added ALLOW_GEN/GEN_NR_OBJECT to the table, both
* CDS views, the BDEF and the entity, but nobody extended this
* handler's own field allow-list, so RegisterTarget refused both as
* "unknown field" (034) - the feature could not be provisioned through
* the gateway's own registration action at all. Same pattern as the
* four existing settable columns; no parallel mechanism introduced.
**********************************************************************
CLASS zcl_fs_dyn_hdl_regi DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES zif_fs_dyn_handler.

    METHODS constructor
      IMPORTING registry TYPE REF TO zcl_fs_dyn_registry
                runtime  TYPE REF TO zif_fs_dyn_runtime.

  PRIVATE SECTION.
    " Named aliases, never an inline TYPE c LENGTH n in a signature
    " (L-373/L-375).
    TYPES ty_operation TYPE zif_fs_dyn_handler=>ty_operation.
    TYPES ty_json      TYPE zif_fs_dyn_handler=>ty_json.
    TYPES ty_name      TYPE zfs_t_dyn_reg-target_name.
    TYPES ty_kind      TYPE zfs_de_dyn_kind.
    TYPES ty_change    TYPE zfs_t_dyn_regh-change_type.

    " Mirrors the allow-list columns a caller may set. The key, the
    " audit fields and the history row are this handler's business,
    " never the caller's - which is why they are absent here.
    TYPES: BEGIN OF ty_payload,
             targetkind  TYPE zfs_t_dyn_reg-target_kind,
             operation   TYPE zfs_t_dyn_reg-operation,
             isactive    TYPE zfs_t_dyn_reg-is_active,
             allowread   TYPE zfs_t_dyn_reg-allow_read,
             allowwrite  TYPE zfs_t_dyn_reg-allow_write,
             callmode    TYPE zfs_t_dyn_reg-call_mode,
             maxrows     TYPE zfs_t_dyn_reg-max_rows,
             loglevel    TYPE zfs_t_dyn_reg-log_level,
             allowgen    TYPE zfs_t_dyn_reg-allow_gen,
             gennrobject TYPE zfs_t_dyn_reg-gen_nr_object,
             descr       TYPE zfs_t_dyn_reg-descr,
           END OF ty_payload.

    CONSTANTS c_msgid TYPE arbgb VALUE 'ZFS_TRM_MSG'.

    DATA mo_registry  TYPE REF TO zcl_fs_dyn_registry.
    DATA mo_runtime   TYPE REF TO zif_fs_dyn_runtime.
    DATA mv_prepared  TYPE abap_bool.
    DATA mv_target    TYPE ty_name.
    DATA mv_operation TYPE ty_operation.
    DATA ms_row       TYPE zfs_t_dyn_reg.
    DATA ms_before    TYPE zfs_t_dyn_reg.
    DATA mv_change    TYPE ty_change.

    METHODS reject_own_object
      RAISING zcx_fs_dyn_error.

    METHODS check_step_operation
      RAISING zcx_fs_dyn_error.

    METHODS parse_payload
      IMPORTING json    TYPE ty_json
      EXPORTING payload TYPE ty_payload
                keys    TYPE string_table
      RAISING   zcx_fs_dyn_error.

    "! Which top-level keys the caller actually sent. /ui2/cl_json
    "! deserializes an absent key as the component's initial value, so
    "! without this an UPDATE could not tell "MaxRows 0" from "MaxRows
    "! not sent" - and would blank every column the payload omitted.
    METHODS json_keys
      IMPORTING json          TYPE ty_json
      RETURNING VALUE(result) TYPE string_table.

    "! Overlays the sent keys onto ROW, and REFUSES any key that is not
    "! one of them. See the implementation for why.
    METHODS apply_payload
      IMPORTING payload TYPE ty_payload
                keys    TYPE string_table
      CHANGING  row     TYPE zfs_t_dyn_reg
      RAISING   zcx_fs_dyn_error.

    METHODS qualify_subm
      RAISING zcx_fs_dyn_error.

    METHODS stamp_audit
      CHANGING row TYPE zfs_t_dyn_reg.

    "! Message 034 - the registration payload is not usable.
    METHODS reject
      IMPORTING reason TYPE string
      RAISING   zcx_fs_dyn_error.

    "! Message 043 - the program cannot be submitted.
    METHODS reject_subm
      IMPORTING reason TYPE string
      RAISING   zcx_fs_dyn_error.

    METHODS outcome_from_error
      IMPORTING error         TYPE REF TO zcx_fs_dyn_error
      RETURNING VALUE(result) TYPE zif_fs_dyn_handler=>ty_outcome.

ENDCLASS.



CLASS zcl_fs_dyn_hdl_regi IMPLEMENTATION.

  METHOD constructor.
    mo_registry = registry.
    mo_runtime  = runtime.
  ENDMETHOD.


  METHOD zif_fs_dyn_handler~kind.
    result = 'REGI'.
  ENDMETHOD.


  METHOD zif_fs_dyn_handler~needs_write.
    result = abap_true.
  ENDMETHOD.


  METHOD zif_fs_dyn_handler~runs_in_caller_luw.
    " Constant. A REGI step writes the allow-list row and its history row
    " through ZCL_FS_DYN_REGISTRY, with static SQL in THIS session - no
    " RFC, no second LUW - so a ROLLBACK WORK here undoes both. That is
    " what makes "one ExecuteBatch provisions a whole system, atomically"
    " true (L-335/L-344), and it is also why a REGI batch must never be
    " mixed with a step that leaves the LUW: the dispatcher's
    " CHECK_LUW_COHERENCE refuses that combination (final review C-1).
    result = abap_true.
  ENDMETHOD.


  METHOD zif_fs_dyn_handler~consumes_number_range.
    " Generators are TABL-only (spec section 3). This kind cannot draw a
    " number, so the answer is constant and safe before PREPARE.
    result = abap_false.
  ENDMETHOD.


  METHOD zif_fs_dyn_handler~prepare.
    DATA ls_payload TYPE ty_payload.
    DATA lt_keys    TYPE string_table.
    DATA lv_kind    TYPE ty_kind.
    DATA lv_found   TYPE abap_bool.

    CLEAR result.
    CLEAR: mv_prepared, ms_row, ms_before, mv_change.

    " Upper-cased and left-shifted before anything looks at them, so
    " neither the self-protection rule nor the operation gate can be
    " walked past with lower case or a leading blank.
    mv_target    = shift_left( val = to_upper( CONV string( step-targetname ) ) ).
    mv_operation = shift_left( val = to_upper( CONV string( step-operation ) ) ).
    IF mv_operation IS INITIAL.
      mv_operation = 'INSERT'.
    ENDIF.

    " REG is not read. A REGI step registers a target; it is not itself
    " dispatched against a registry row, and the dispatcher passes an
    " empty one. The parameter exists because ZIF_FS_DYN_HANDLER defines
    " one shape for all five handlers.

    TRY.
        reject_own_object( ).
        check_step_operation( ).

        IF mv_target IS INITIAL.
          reject( 'TargetName is missing' ).
        ENDIF.

        parse_payload( EXPORTING json    = step-importjson
                       IMPORTING payload = ls_payload
                                 keys    = lt_keys ).

        lv_kind = shift_left( val = to_upper( CONV string( ls_payload-targetkind ) ) ).
        ls_payload-targetkind = lv_kind.
        ls_payload-operation  = shift_left( val = to_upper( CONV string( ls_payload-operation ) ) ).

        " TargetKind is required on every operation, not only on INSERT.
        " (kind, name) is the registry's identity - a blank kind cannot
        " address a row, and letting an UPDATE through with one would
        " answer 017 for a target that plainly exists. A deliberate
        " tightening of v1, which only demanded it for a non-UPDATE.
        IF lv_kind IS INITIAL.
          reject( 'TargetKind is missing' ).
        ENDIF.

        IF lv_kind = 'REGI'.
          reject( 'REGI is a step kind, not a registrable TargetKind' ).
        ENDIF.

        IF     lv_kind <> 'FUNC' AND lv_kind <> 'TABL'
           AND lv_kind <> 'QURY' AND lv_kind <> 'SUBM'.
          reject( |TargetKind { lv_kind } is not registrable| ).
        ENDIF.

        IF ls_payload-maxrows < 0.
          reject( 'MaxRows must not be negative' ).
        ENDIF.

        CASE mv_operation.

          WHEN 'INSERT'.
            " The duplicate check, made here rather than left to the
            " database. EXISTS deliberately sees an inactive row and an
            " earlier REGI step's declaration as well as a committed
            " row: all three occupy the target.
            IF mo_registry->exists( kind = lv_kind name = mv_target ) = abap_true.
              RAISE EXCEPTION NEW zcx_fs_dyn_error(
                errcat = 'BUSINESS'
                msgv1  = CONV #( mv_target )
                textid = VALUE #( msgid = c_msgid msgno = '035' ) ).
            ENDIF.
            mv_change = 'I'.

          WHEN 'UPDATE'.
            " The COMMITTED row, never the buffer: an UPDATE changes what
            " is on the database and must not read an earlier step's
            " declaration back as if it were already there.
            mo_registry->committed_row( EXPORTING kind  = lv_kind
                                                  name  = mv_target
                                        IMPORTING row   = ms_before
                                                  found = lv_found ).
            IF lv_found = abap_false.
              RAISE EXCEPTION NEW zcx_fs_dyn_error(
                errcat = 'CLIENT'
                msgv1  = CONV #( mv_target )
                textid = VALUE #( msgid = c_msgid msgno = '017' ) ).
            ENDIF.
            ms_row    = ms_before.
            mv_change = 'U'.

          WHEN OTHERS.
            " UPSERT, resolved HERE in phase 1 so phase 2 has nothing
            " left to work out and cannot decide differently.
            mo_registry->committed_row( EXPORTING kind  = lv_kind
                                                  name  = mv_target
                                        IMPORTING row   = ms_before
                                                  found = lv_found ).
            IF lv_found = abap_true.
              mv_operation = 'UPDATE'.
              ms_row       = ms_before.
              mv_change    = 'U'.
            ELSE.
              mv_operation = 'INSERT'.
              CLEAR ms_row.
              mv_change    = 'I'.
            ENDIF.

        ENDCASE.

        IF mv_change = 'I'.
          TRY.
              ms_row-reg_uuid = cl_system_uuid=>create_uuid_x16_static( ).
            CATCH cx_uuid_error INTO DATA(lx_uuid).
              " 020, NOT 034. A UUID generator failing is a TECHNICAL
              " failure of this system; the caller's payload is fine and
              " telling them it is "invalid" sends them to re-read a
              " request that was never the problem. ERRCAT 'TARGET' and
              " message 020 are exactly what ZCL_FS_DYN_REGISTRY answers
              " for the identical failure on the history row, and the
              " two must not disagree about the same event.
              RAISE EXCEPTION NEW zcx_fs_dyn_error(
                errcat   = 'TARGET'
                msgv1    = CONV #( mv_target )
                msgv2    = 'registration UUID could not be created'
                previous = lx_uuid
                textid   = VALUE #( msgid = c_msgid msgno = '020' ) ).
          ENDTRY.
        ENDIF.

        ms_row-client      = sy-mandt.
        ms_row-target_kind = lv_kind.
        ms_row-target_name = mv_target.

        apply_payload( EXPORTING payload = ls_payload
                                 keys    = lt_keys
                       CHANGING  row     = ms_row ).

        IF ms_row-target_kind = 'SUBM'.
          qualify_subm( ).
        ENDIF.

        " Published last, so a payload that is about to be refused never
        " reaches the buffer a later step resolves against (L-344).
        mo_registry->declare_pending( ms_row ).

      CATCH zcx_fs_dyn_error INTO DATA(lx_error).
        result = outcome_from_error( lx_error ).
        RETURN.
    ENDTRY.

    mv_prepared     = abap_true.
    result-status   = 'S'.
    result-severity = 'S'.
  ENDMETHOD.


  METHOD zif_fs_dyn_handler~execute.
    DATA lv_rows   TYPE i.
    DATA lv_before TYPE string.
    DATA lv_after  TYPE string.

    CLEAR result.

    IF mv_prepared = abap_false.
      " Not a caller error - the dispatcher calls PREPARE before EXECUTE
      " for every step - so it is reported as a technical failure rather
      " than dressed up as a bad payload.
      "
      " MESSAGE 049 "Internal gateway error in &1: &2", not 020. 020
      " reads "Dynamic call of &1 failed", and nothing dynamic is being
      " called here: this is the framework's own call sequence being
      " violated, against a STATIC registry write. Sending whoever is
      " debugging it to look for a failed dynamic call is a wasted
      " afternoon. LCL_GUARDED_HANDLER in ZCL_FS_DYN_FACTORY answers the
      " identical violation with the identical message, because it is
      " the identical event reached through the wrapper instead.
      result-status   = 'E'.
      result-severity = 'E'.
      result-errcat   = 'TARGET'.
      result-msgid    = c_msgid.
      result-msgno    = '049'.
      MESSAGE ID c_msgid TYPE 'E' NUMBER '049'
        WITH mv_target 'execute called without a successful prepare'
        INTO result-msgtext.
      RETURN.
    ENDIF.

    TRY.
        stamp_audit( CHANGING row = ms_row ).

        lv_rows = mo_registry->save_row( row         = ms_row
                                         insert_mode = xsdbool( mv_change = 'I' ) ).

        lv_after = /ui2/cl_json=>serialize( data        = ms_row
                                            pretty_name = /ui2/cl_json=>pretty_mode-none ).
        IF mv_change = 'U'.
          lv_before = /ui2/cl_json=>serialize( data        = ms_before
                                               pretty_name = /ui2/cl_json=>pretty_mode-none ).
        ENDIF.

        mo_registry->save_history( VALUE #(
          reg_uuid    = ms_row-reg_uuid
          change_type = mv_change
          target_kind = ms_row-target_kind
          target_name = ms_row-target_name
          source      = 'REGI'
          call_uuid   = mo_registry->current_call_uuid( )
          before_json = lv_before
          after_json  = lv_after ) ).

      CATCH zcx_fs_dyn_error INTO DATA(lx_error).
        result = outcome_from_error( lx_error ).
        RETURN.
    ENDTRY.

    " 036, never the shared 026. 026 reads "&1 executed successfully",
    " which for a REGI step names the target being REGISTERED and so
    " asserts an execution that never happened - a human reading their
    " own call log asked whether the gateway had also invoked the BAPI;
    " it had not (L-370).
    result-status      = 'S'.
    result-severity    = 'S'.
    result-resultcount = lv_rows.
    result-msgid       = c_msgid.
    result-msgno       = '036'.
    MESSAGE ID c_msgid TYPE 'S' NUMBER '036'
      WITH mv_target |{ lv_rows }| INTO result-msgtext.
  ENDMETHOD.


  METHOD reject_own_object.
    IF     mv_target CP 'ZFS_T_DYN_*'
        OR mv_target CP 'ZFS_RFC_DYN_*'
        OR mv_target CP 'ZFS_T_SLC_GW*'.
      RAISE EXCEPTION NEW zcx_fs_dyn_error(
        errcat = 'AUTH'
        msgv1  = CONV #( mv_target )
        textid = VALUE #( msgid = c_msgid msgno = '039' ) ).
    ENDIF.
  ENDMETHOD.


  METHOD check_step_operation.
    IF     mv_operation <> 'INSERT'
       AND mv_operation <> 'UPDATE'
       AND mv_operation <> 'UPSERT'.
      RAISE EXCEPTION NEW zcx_fs_dyn_error(
        errcat = 'BUSINESS'
        msgv1  = CONV #( mv_operation )
        msgv2  = CONV #( mv_target )
        textid = VALUE #( msgid = c_msgid msgno = '018' ) ).
    ENDIF.
  ENDMETHOD.


  METHOD parse_payload.
    CLEAR: payload, keys.

    IF json IS INITIAL.
      reject( 'ImportJson is empty' ).
    ENDIF.

    " Caught broadly on purpose: this parses caller-supplied text, and a
    " malformed payload must become a message, never a short dump.
    TRY.
        /ui2/cl_json=>deserialize( EXPORTING json = json
                                   CHANGING  data = payload ).
      CATCH cx_root.
        reject( 'ImportJson is not valid JSON' ).
    ENDTRY.

    keys = json_keys( json ).
    IF keys IS INITIAL.
      reject( 'ImportJson carries no fields' ).
    ENDIF.
  ENDMETHOD.


  METHOD json_keys.
    DATA lr_data TYPE REF TO data.
    DATA lo_str  TYPE REF TO cl_abap_structdescr.

    IF json IS INITIAL.
      RETURN.
    ENDIF.

    " GENERATE builds a data reference whose components are exactly the
    " JSON's own top-level keys - that is the "was it supplied?" answer.
    TRY.
        lr_data = /ui2/cl_json=>generate( json = json ).
      CATCH cx_root.
        RETURN.
    ENDTRY.
    IF lr_data IS NOT BOUND.
      RETURN.
    ENDIF.

    TRY.
        lo_str ?= cl_abap_typedescr=>describe_by_data_ref( lr_data ).
      CATCH cx_sy_move_cast_error.
        RETURN.
    ENDTRY.

    LOOP AT lo_str->components INTO DATA(ls_comp).
      APPEND to_upper( |{ ls_comp-name }| ) TO result.
    ENDLOOP.
  ENDMETHOD.


  METHOD apply_payload.
    " Only the keys the caller actually sent are overlaid. Everything
    " else keeps whatever the committed row carried, which for an INSERT
    " is initial and for an UPDATE is the live registration.
    "
    " AN UNRECOGNISED KEY IS REFUSED, BY NAME. This loop used to end
    " "WHEN OTHERS. CONTINUE." - it silently dropped anything it did not
    " recognise. The failure that buys is not theoretical: a REGI UPDATE
    " sending {"TargetKind":"TABL","AllowWrites":""} - note the typo,
    " AllowWrites for AllowWrite - left ALLOW_WRITE = 'X' exactly as it
    " was, wrote the unchanged row, and answered 036 "registered, 1
    " row(s) affected" with a before/after history image that agreed
    " with itself. The caller was told a revocation succeeded when
    " nothing had been revoked, on the security boundary of all things.
    "
    " 034 with the offending key in &2, ERRCAT CLIENT: the payload IS
    " the problem and the caller is the only one who can fix it. A
    " request that changes nothing must never be reported as a change
    " (L-405).
    "
    " ALLOWGEN / GENNROBJECT added 2026-09-15 fix round 1 (L-517): same
    " pattern as ALLOWREAD/ALLOWWRITE/MAXROWS/LOGLEVEL above - the two
    " new registry columns needed a line here or RegisterTarget could
    " never grant generation rights at all.
    LOOP AT keys INTO DATA(lv_key).
      CASE lv_key.
        WHEN 'TARGETKIND'.  row-target_kind    = payload-targetkind.
        WHEN 'OPERATION'.   row-operation      = payload-operation.
        WHEN 'ISACTIVE'.    row-is_active      = payload-isactive.
        WHEN 'ALLOWREAD'.   row-allow_read     = payload-allowread.
        WHEN 'ALLOWWRITE'.  row-allow_write    = payload-allowwrite.
        WHEN 'CALLMODE'.    row-call_mode      = payload-callmode.
        WHEN 'MAXROWS'.     row-max_rows       = payload-maxrows.
        WHEN 'LOGLEVEL'.    row-log_level      = payload-loglevel.
        WHEN 'ALLOWGEN'.    row-allow_gen      = payload-allowgen.
        WHEN 'GENNROBJECT'. row-gen_nr_object  = payload-gennrobject.
        WHEN 'DESCR'.       row-descr          = payload-descr.
        WHEN OTHERS.        reject( |unknown field { lv_key }| ).
      ENDCASE.
    ENDLOOP.
  ENDMETHOD.


  METHOD qualify_subm.
    " The three cheap checks the integration guide prescribes, minus the
    " timed trial run, which cannot be automated at registration time.
    " The OBLIGATORY-select-option rule is a property of each CALL, not
    " of the registration, and is enforced by the SUBM handler.
    DATA(ls_info) = mo_runtime->program_info( CONV progname( ms_row-target_name ) ).

    IF ls_info-exists = abap_false.
      reject_subm( 'no TRDIR entry - the program does not exist' ).
    ENDIF.

    IF ls_info-subc <> '1'.
      reject_subm( |not an executable report (TRDIR-SUBC '{ ls_info-subc }')| ).
    ENDIF.

    IF ls_info-gui_dependent = abap_true.
      reject_subm( 'it references a CL_GUI_* control and there is no GUI in the execution session' ).
    ENDIF.
  ENDMETHOD.


  METHOD stamp_audit.
    DATA lv_now TYPE timestampl.

    GET TIME STAMP FIELD lv_now.
    row-local_last_changed_by = sy-uname.
    row-local_last_changed_at = lv_now.
    row-last_changed_at       = lv_now.

    IF row-local_created_by IS INITIAL.
      row-local_created_by = sy-uname.
      row-local_created_at = lv_now.
    ENDIF.
  ENDMETHOD.


  METHOD reject.
    RAISE EXCEPTION NEW zcx_fs_dyn_error(
      errcat = 'CLIENT'
      msgv1  = CONV #( mv_target )
      msgv2  = CONV #( reason )
      textid = VALUE #( msgid = c_msgid msgno = '034' ) ).
  ENDMETHOD.


  METHOD reject_subm.
    RAISE EXCEPTION NEW zcx_fs_dyn_error(
      errcat = 'CLIENT'
      msgv1  = CONV #( mv_target )
      msgv2  = CONV #( reason )
      textid = VALUE #( msgid = c_msgid msgno = '043' ) ).
  ENDMETHOD.


  METHOD outcome_from_error.
    result-status   = 'E'.
    result-severity = 'E'.
    result-errcat   = error->errcat.
    result-msgid    = c_msgid.
    result-msgno    = error->msgno.
    result-msgtext  = error->get_text( ).
  ENDMETHOD.

ENDCLASS.
