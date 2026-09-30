"! Query provider of ZFS_CE_AlmTrmPrincipal: /FS00/ALMR015 (TRM principal outstanding, ALM 2/3) as an API.
"! The business rules are the report's; its technical defects are fixed: a security is listed once
"! although it is also reached through its deals (D6), a security amount goes to exactly one bucket (D12),
"! the 10E rate is read by the released CL_EXCHANGE_RATES (no user date format, TCURF factors and
"! indirect quotation respected, D14/D15), the product flags are read for the company code (D16),
"! no flagged product means no rows instead of all products (D17), and a deal that /FS00/CDS0001
"! repeats is counted once. The TPM12 capture fails soft: its securities are kept with
"! Tpm12CaptureFailed = X and Total 0, the rest of the result is returned.
CLASS zcl_fs_alm_trmprin_query DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_rap_query_provider.

    TYPES tt_result TYPE STANDARD TABLE OF zfs_ce_almtrmprincipal WITH EMPTY KEY.

    "! All rows of a period without $filter, as the service returns them (used by the ALM 2 quarterly report).
    METHODS get_rows
      IMPORTING iv_bukrs         TYPE bukrs
                iv_year          TYPE /fs00/almdt0032
                iv_month         TYPE /fs00/almdt0031
      RETURNING VALUE(rt_result) TYPE tt_result.

  PRIVATE SECTION.
    TYPES:
      ty_row        TYPE zfs_ce_almtrmprincipal,
      ty_amount     TYPE zfs_ce_almtrmprincipal-total,
      tt_product_r  TYPE RANGE OF vvsart,
      tt_deal_r     TYPE RANGE OF tb_rfha,
      tt_security_r TYPE RANGE OF vvranlw,
      tt_trtype_r   TYPE RANGE OF tb_sfhaart,
      BEGIN OF ty_deal,
        bukrs    TYPE bukrs,
        rfha     TYPE tb_rfha,
        ranl     TYPE vvranlw,
        activity TYPE tb_xttext,
        sgsart   TYPE vvsart,
        ltx      TYPE bu_title_let,
        sfhaart  TYPE tb_sfhaart,
        xtext    TYPE bu_title_let,
        kontrh   TYPE tb_kunnr_new,
        wgschft  TYPE tb_wgschft,
        bp_name  TYPE bu_title_let,
        dblfz    TYPE tb_dblfz,
        delfz    TYPE tb_delfz,
        s_edate  TYPE d,
        szsref   TYPE szsref,
      END OF ty_deal,
      tt_deal TYPE STANDARD TABLE OF ty_deal WITH EMPTY KEY,
      BEGIN OF ty_flow,
        deal_number    TYPE tb_rfha,
        security_id    TYPE vvranlw,
        valuation_area TYPE tpm_val_area,
        zfs_flow       TYPE zdt_flow_cat,
        trldate        TYPE d,
        nominal_amt    TYPE tpm_nominal_amt,
        position_amt   TYPE tpm_position_amt,
      END OF ty_flow,
      " Key orders reproduce the report's SORT, so "the first flow" is the same flow.
      tt_flow TYPE STANDARD TABLE OF ty_flow WITH EMPTY KEY
        WITH NON-UNIQUE SORTED KEY deal COMPONENTS deal_number valuation_area zfs_flow trldate
        WITH NON-UNIQUE SORTED KEY security COMPONENTS security_id valuation_area zfs_flow deal_number trldate,
      BEGIN OF ty_bucket,
        bucket    TYPE /fs00/almdt0013,
        from_days TYPE i,
        to_days   TYPE i,
      END OF ty_bucket,
      tt_bucket TYPE STANDARD TABLE OF ty_bucket WITH EMPTY KEY,
      BEGIN OF ty_position,
        company_code   TYPE bukrs,
        security_id    TYPE vvranlw,
        valuation_area TYPE tpm_val_area,
        amaqu_val_pc   TYPE fti_amaqu_val_pc,
        mat_term_end   TYPE dendlfz,
      END OF ty_position,
      tt_position TYPE STANDARD TABLE OF ty_position WITH EMPTY KEY,
      BEGIN OF ty_tpm12_value,
        security_id TYPE vvranlw,
        amount      TYPE ty_amount,
        maturity    TYPE d,
      END OF ty_tpm12_value,
      tt_tpm12_value TYPE HASHED TABLE OF ty_tpm12_value WITH UNIQUE KEY security_id.

    CONSTANTS:
      BEGIN OF c_product,
        excluded TYPE vvsart VALUE '10A',
        fx       TYPE vvsart VALUE '10E',
        bond     TYPE vvsart VALUE '15D',
      END OF c_product,
      BEGIN OF c_area,
        first  TYPE tpm_val_area VALUE '001',
        second TYPE tpm_val_area VALUE '002',
      END OF c_area,
      c_rate_type TYPE kurst VALUE 'TRMR',
      c_currency  TYPE waers VALUE 'INR',
      " Value codes of the report's Fixed/Variable column, not UI texts.
      c_fixed     TYPE zfs_ce_almtrmprincipal-fixedorvariable VALUE '01 - Fixed' ##NO_TEXT,
      c_variable  TYPE zfs_ce_almtrmprincipal-fixedorvariable VALUE '02 - Variable' ##NO_TEXT.

    "! Last day of the month P_FiscalYear/P_FiscalPeriod; the report's GV_DATE.
    DATA mv_month_end TYPE d.
    "! ALM 2/3 buckets as day counts from the month end, in bucket order.
    DATA mt_bucket TYPE tt_bucket.

    METHODS build
      IMPORTING iv_bukrs         TYPE bukrs
                iv_year          TYPE /fs00/almdt0032
                iv_month         TYPE /fs00/almdt0031
                it_filter        TYPE if_rap_query_filter=>tt_name_range_pairs
      RETURNING VALUE(rt_result) TYPE tt_result.
    METHODS read_buckets.
    METHODS read_deals
      IMPORTING iv_bukrs       TYPE bukrs
                it_product     TYPE tt_product_r
                it_deal        TYPE tt_deal_r
                it_security    TYPE tt_security_r
                it_trtype      TYPE tt_trtype_r
      RETURNING VALUE(rt_deal) TYPE tt_deal.
    METHODS read_flows
      IMPORTING iv_bukrs       TYPE bukrs
                it_product     TYPE tt_product_r
                it_deal        TYPE tt_deal_r
                it_security    TYPE tt_security_r
      RETURNING VALUE(rt_flow) TYPE tt_flow.
    "! TPM12 amortised acquisition value per security, captured from RTPM_TRL_SHOW_POSITION_VALUES.
    "! EV_FAILED = X when the list could not be run or captured (fails soft, no values).
    METHODS read_tpm12
      IMPORTING iv_bukrs    TYPE bukrs
                it_product  TYPE tt_product_r
                it_security TYPE tt_security_r
      EXPORTING et_value    TYPE tt_tpm12_value
                ev_failed   TYPE abap_boolean.
    METHODS capture_positions
      IMPORTING iv_bukrs           TYPE bukrs
                it_product         TYPE tt_product_r
                it_security        TYPE tt_security_r
      RETURNING VALUE(rt_position) TYPE tt_position
      RAISING   cx_salv_bs_sc_runtime_info.
    METHODS money_market_row
      IMPORTING is_deal       TYPE ty_deal
                it_flow       TYPE tt_flow
      RETURNING VALUE(rs_row) TYPE ty_row.
    METHODS security_row
      IMPORTING is_deal       TYPE ty_deal
                it_flow       TYPE tt_flow
                it_tpm12      TYPE tt_tpm12_value
                it_tpm12_prod TYPE tt_product_r
                iv_tpm12_fail TYPE abap_boolean
      RETURNING VALUE(rs_row) TYPE ty_row.
    "! 10E: nominal of the deal's first FL01 in INR at the TRMR rate of the month end.
    "! Raises CX_EXCHANGE_RATES when there is no rate (the report then treats the deal as any other).
    METHODS fx_outstanding
      IMPORTING is_deal          TYPE ty_deal
                it_flow          TYPE tt_flow
      RETURNING VALUE(rv_amount) TYPE ty_amount
      RAISING   cx_exchange_rates.
    METHODS bond_outstanding
      IMPORTING iv_security      TYPE vvranlw
                it_flow          TYPE tt_flow
      RETURNING VALUE(rv_amount) TYPE ty_amount.
    METHODS new_row
      IMPORTING is_deal       TYPE ty_deal
      RETURNING VALUE(rs_row) TYPE ty_row.
    "! Adds an amount to the first bucket that holds the days from the month end to IV_DATE.
    METHODS place
      IMPORTING iv_amount TYPE ty_amount
                iv_date   TYPE d
      CHANGING  cs_row    TYPE ty_row.
    METHODS filter_range
      IMPORTING it_filter       TYPE if_rap_query_filter=>tt_name_range_pairs
                iv_name         TYPE string
      RETURNING VALUE(rt_range) TYPE if_rap_query_filter=>tt_range_option.
    METHODS apply_filter
      IMPORTING it_filter TYPE if_rap_query_filter=>tt_name_range_pairs
      CHANGING  ct_result TYPE tt_result.
ENDCLASS.



CLASS zcl_fs_alm_trmprin_query IMPLEMENTATION.

  METHOD get_rows.
    rt_result = build( iv_bukrs = iv_bukrs iv_year = iv_year iv_month = iv_month it_filter = VALUE #( ) ).
  ENDMETHOD.

  METHOD if_rap_query_provider~select.
    DATA: lv_bukrs  TYPE bukrs,
          lv_year   TYPE /fs00/almdt0032,
          lv_month  TYPE /fs00/almdt0031,
          lt_result TYPE tt_result,
          lt_page   TYPE tt_result.

    LOOP AT io_request->get_parameters( ) INTO DATA(ls_param).
      CASE ls_param-parameter_name.
        WHEN 'P_COMPANYCODE'.
          lv_bukrs = ls_param-value.
        WHEN 'P_FISCALYEAR'.
          lv_year = ls_param-value.
        WHEN 'P_FISCALPERIOD'.
          lv_month = ls_param-value.
      ENDCASE.
    ENDLOOP.

    TRY.
        DATA(lt_filter) = io_request->get_filter( )->get_as_ranges( ).
        lt_result = build( iv_bukrs = lv_bukrs iv_year = lv_year iv_month = lv_month it_filter = lt_filter ).
        apply_filter( EXPORTING it_filter = lt_filter CHANGING ct_result = lt_result ).
      CATCH cx_rap_query_filter_no_range.
        " A filter that is not expressible as ranges (e.g. OR across two elements) is not
        " supported: answer with no rows rather than with unfiltered data.
        CLEAR lt_result.
    ENDTRY.

    DATA(lt_sort) = VALUE abap_sortorder_tab( FOR ls_sort IN io_request->get_sort_elements( )
                                              ( name = to_upper( ls_sort-element_name ) descending = ls_sort-descending ) ).
    IF lt_sort IS INITIAL.
      lt_sort = VALUE #( ( name = 'COMPANYCODE' ) ( name = 'DEALNUMBER' ) ( name = 'SECURITYID' ) ) ##NO_TEXT.
    ENDIF.
    SORT lt_result BY (lt_sort).

    IF io_request->is_total_numb_of_rec_requested( ).
      io_response->set_total_number_of_records( lines( lt_result ) ).
    ENDIF.
    IF io_request->is_data_requested( ).
      DATA(lv_offset) = io_request->get_paging( )->get_offset( ).
      DATA(lv_size)   = io_request->get_paging( )->get_page_size( ).
      LOOP AT lt_result INTO DATA(ls_row) FROM lv_offset + 1.
        IF lv_size <> if_rap_query_paging=>page_size_unlimited AND lines( lt_page ) >= lv_size.
          EXIT.
        ENDIF.
        APPEND ls_row TO lt_page.
      ENDLOOP.
      io_response->set_data( lt_page ).
    ENDIF.
  ENDMETHOD.

  METHOD build.
    DATA lt_tpm12      TYPE tt_tpm12_value.
    DATA lv_tpm12_fail TYPE abap_boolean.

    IF iv_bukrs IS INITIAL OR iv_year IS INITIAL OR iv_month < 1 OR iv_month > 12.
      RETURN.
    ENDIF.

    " Month end as the report (GV_DATE); the buckets start the day after.
    mv_month_end = |{ iv_year }{ iv_month }01|.
    mv_month_end = mv_month_end + 31.
    mv_month_end+6(2) = '01'.
    mv_month_end = mv_month_end - 1.
    read_buckets( ).

    " Filters pushed into the selection. A security row has no deal number and a money-market
    " row no security ID, so a range that admits the blank value is left to the result filter.
    DATA(lt_deal_r) = CORRESPONDING tt_deal_r( filter_range( it_filter = it_filter iv_name = `DEALNUMBER` ) ).
    IF lt_deal_r IS NOT INITIAL AND CONV tb_rfha( space ) IN lt_deal_r.
      CLEAR lt_deal_r.
    ENDIF.
    DATA(lt_security_r) = CORRESPONDING tt_security_r( filter_range( it_filter = it_filter iv_name = `SECURITYID` ) ).
    IF lt_security_r IS NOT INITIAL AND CONV vvranlw( space ) IN lt_security_r.
      CLEAR lt_security_r.
    ENDIF.
    DATA(lt_product_f) = CORRESPONDING tt_product_r( filter_range( it_filter = it_filter iv_name = `PRODUCTTYPE` ) ).
    DATA(lt_trtype_r)  = CORRESPONDING tt_trtype_r( filter_range( it_filter = it_filter iv_name = `TRANSACTIONTYPE` ) ).

    " Products flagged for principal O/S (and for TPM12 values) in the company code. 10A is
    " never shown by the report (it deletes those rows at the end), so it is not read at all.
    SELECT zprd_type, zprinc, zprinc_tpm12
      FROM /fs00/almtr026
      WHERE zbukrs     = @iv_bukrs
        AND zprd_type IN @lt_product_f
        AND zprd_type <> @c_product-excluded
        AND ( zprinc = @abap_true OR zprinc_tpm12 = @abap_true )
      INTO TABLE @DATA(lt_flag).
    DATA(lt_product_r) = VALUE tt_product_r( FOR f IN lt_flag WHERE ( zprinc = abap_true )
                                             ( sign = 'I' option = 'EQ' low = f-zprd_type ) ).
    IF lt_product_r IS INITIAL.
      RETURN.
    ENDIF.
    DATA(lt_tpm12_r) = VALUE tt_product_r( FOR f IN lt_flag WHERE ( zprinc_tpm12 = abap_true )
                                           ( sign = 'I' option = 'EQ' low = f-zprd_type ) ).

    DATA(lt_deal) = read_deals( iv_bukrs    = iv_bukrs
                                it_product  = lt_product_r
                                it_deal     = lt_deal_r
                                it_security = lt_security_r
                                it_trtype   = lt_trtype_r ).
    IF lt_deal IS INITIAL.
      RETURN.
    ENDIF.

    " Money market: one row per deal, although /FS00/CDS0001 (select distinct over several joins) can repeat it.
    DATA(lt_mm) = VALUE tt_deal( FOR d IN lt_deal WHERE ( ranl IS INITIAL ) ( d ) ).
    SORT lt_mm BY rfha.
    DELETE ADJACENT DUPLICATES FROM lt_mm COMPARING rfha.
    " Securities: one row per security, whether it is live by a deal or by its own end date (D6).
    " A deal-number filter leaves no security row (their deal number is blank).
    DATA(lt_sec) = COND tt_deal( WHEN lt_deal_r IS INITIAL
                                 THEN VALUE #( FOR d IN lt_deal WHERE ( ranl IS NOT INITIAL ) ( d ) ) ).
    SORT lt_sec BY ranl rfha.
    DELETE ADJACENT DUPLICATES FROM lt_sec COMPARING ranl.

    DATA(lt_flow) = read_flows( iv_bukrs    = iv_bukrs
                                it_product  = lt_product_r
                                it_deal     = lt_deal_r
                                it_security = lt_security_r ).

    " TPM12 values once per request, for the securities that take them.
    DATA(lt_tpm12_sec) = VALUE tt_security_r( FOR d IN lt_sec
                                              WHERE ( sgsart IN lt_tpm12_r AND sgsart <> c_product-bond )
                                              ( sign = 'I' option = 'EQ' low = d-ranl ) ).
    IF lt_tpm12_r IS NOT INITIAL AND lt_tpm12_sec IS NOT INITIAL.
      read_tpm12( EXPORTING iv_bukrs    = iv_bukrs
                            it_product  = lt_tpm12_r
                            it_security = lt_tpm12_sec
                  IMPORTING et_value    = lt_tpm12
                            ev_failed   = lv_tpm12_fail ).
    ENDIF.

    rt_result = VALUE #( FOR d IN lt_mm ( money_market_row( is_deal = d it_flow = lt_flow ) ) ).
    rt_result = VALUE #( BASE rt_result
                         FOR d IN lt_sec ( security_row( is_deal       = d
                                                         it_flow       = lt_flow
                                                         it_tpm12      = lt_tpm12
                                                         it_tpm12_prod = lt_tpm12_r
                                                         iv_tpm12_fail = lv_tpm12_fail ) ) ).

    " As the report: a row without any amount in the buckets is not shown, except a security
    " whose TPM12 value could not be captured - it stays, flagged, so the caller sees the gap.
    DELETE rt_result WHERE total = 0 AND tpm12capturefailed = abap_false.
  ENDMETHOD.

  METHOD read_buckets.
    DATA lt_bucket TYPE /fs00/almtt001.

    CLEAR mt_bucket.
    DATA(lv_key) = CONV dats( mv_month_end + 1 ).
    CALL FUNCTION '/FS00/ALMFM001'
      EXPORTING
        im_type = '02'
        im_date = lv_key
      IMPORTING
        ex_buck = lt_bucket.
    " The FM returns the day limits as characters; convert once.
    mt_bucket = VALUE #( FOR b IN lt_bucket ( bucket = b-zbuc from_days = b-zf_days to_days = b-zt_days ) ).
    SORT mt_bucket BY bucket.
  ENDMETHOD.

  METHOD read_deals.
    " Deals live at the month end (the report's money-market selection) and deals on a security
    " live by the security's end date (its security selection), in one read.
    SELECT bukrs, rfha, ranl, activity, sgsart, ltx, sfhaart, xtext, kontrh, wgschft,
           bp_name, dblfz, delfz, s_edate, szsref
      FROM /fs00/cds0001
      WHERE bukrs    = @iv_bukrs
        AND sgsart  IN @it_product
        AND sfhaart IN @it_trtype
        AND rfha    IN @it_deal
        AND ranl    IN @it_security
        AND dblfz   <= @mv_month_end
        AND ( delfz >= @mv_month_end OR ( ranl <> @space AND s_edate >= @mv_month_end ) )
      INTO CORRESPONDING FIELDS OF TABLE @rt_deal.
  ENDMETHOD.

  METHOD read_flows.
    " Only the flows the rules use: FL01/FL03/FL04 (deals, 15D), FL31/FL51/FL52 (15D), area 002 for FL51/FL52.
    SELECT deal_number, security_id, valuation_area, zfs_flow, trldate, nominal_amt, position_amt
      FROM /fs00/cds0002
      WHERE company_code   = @iv_bukrs
        AND product_type  IN @it_product
        AND deal_number   IN @it_deal
        AND security_id   IN @it_security
        AND booking_state <> '4'
        AND flowtype      <> 'MM1110-'
        AND ( ( valuation_area = @c_area-first
                AND zfs_flow IN ( 'FL01', 'FL03', 'FL04', 'FL31', 'FL51', 'FL52' ) )
           OR ( valuation_area = @c_area-second AND zfs_flow IN ( 'FL51', 'FL52' ) ) )
      ORDER BY deal_number, security_id, valuation_area, zfs_flow, trldate
      INTO CORRESPONDING FIELDS OF TABLE @rt_flow.
  ENDMETHOD.

  METHOD read_tpm12.
    CLEAR: et_value, ev_failed.
    TRY.
        DATA(lt_position) = capture_positions( iv_bukrs = iv_bukrs it_product = it_product it_security = it_security ).
      CATCH cx_static_check cx_dynamic_check.
        " Fail soft: no TPM12 values; the securities that need them are flagged, the rest is returned.
        ev_failed = abap_true.
    ENDTRY.
    cl_salv_bs_runtime_info=>clear_all( ).

    LOOP AT lt_position INTO DATA(ls_position) WHERE company_code = iv_bukrs AND valuation_area = c_area-first.
      ASSIGN et_value[ security_id = ls_position-security_id ] TO FIELD-SYMBOL(<ls_value>).
      IF sy-subrc <> 0.
        INSERT VALUE #( security_id = ls_position-security_id ) INTO TABLE et_value ASSIGNING <ls_value>.
      ENDIF.
      <ls_value>-amount  += ls_position-amaqu_val_pc.
      <ls_value>-maturity = ls_position-mat_term_end.
    ENDLOOP.
  ENDMETHOD.

  METHOD capture_positions.
    FIELD-SYMBOLS <lt_data> TYPE ANY TABLE.

    " No released API gives the TPM12 position values: run the standard list as /FS00/ALMR015
    " does and take its ALV data instead of displaying it.
    cl_salv_bs_runtime_info=>set( display  = abap_false
                                  metadata = abap_false
                                  data     = abap_true ).
    SUBMIT rtpm_trl_show_position_values
      WITH p_sec    = abap_true
      WITH p_dea    = abap_false
      WITH so_bukrs = iv_bukrs
      WITH so_ranl IN it_security
      WITH so_pt   IN it_product
      WITH pm_date  = mv_month_end
      WITH pm_noz   = abap_true
      WITH pm_pla   = abap_true
      EXPORTING LIST TO MEMORY AND RETURN.
    cl_salv_bs_runtime_info=>get_data_ref( IMPORTING r_data = DATA(lr_data) ).
    IF lr_data IS BOUND.
      ASSIGN lr_data->* TO <lt_data>.
      MOVE-CORRESPONDING <lt_data> TO rt_position.
    ENDIF.
  ENDMETHOD.

  METHOD money_market_row.
    rs_row = new_row( is_deal ).
    rs_row-fixedorvariable = COND #( WHEN is_deal-szsref IS INITIAL THEN c_fixed ELSE c_variable ).

    IF is_deal-sgsart = c_product-fx AND is_deal-wgschft <> c_currency.
      TRY.
          DATA(lv_amount) = CONV ty_amount( abs( fx_outstanding( is_deal = is_deal it_flow = it_flow ) ) ).
          IF lv_amount <> 0.
            rs_row-outstandingamount = lv_amount.
            rs_row-repaymentdate     = is_deal-delfz.
            place( EXPORTING iv_amount = lv_amount iv_date = is_deal-delfz CHANGING cs_row = rs_row ).
          ENDIF.
          RETURN.
        CATCH cx_exchange_rates.
          " No TRMR rate: the report falls back to the repayment flows.
          CLEAR rs_row-outstandingamount.
      ENDTRY.
    ENDIF.

    " Repayments (FL03/FL04) from the month end on, signed, each in its own bucket; no repayment date.
    LOOP AT it_flow INTO DATA(ls_flow) USING KEY deal
         WHERE deal_number    = is_deal-rfha
           AND valuation_area = c_area-first
           AND ( zfs_flow = 'FL03' OR zfs_flow = 'FL04' )
           AND trldate       >= mv_month_end.
      place( EXPORTING iv_amount = CONV #( ls_flow-position_amt ) iv_date = ls_flow-trldate CHANGING cs_row = rs_row ).
    ENDLOOP.
    rs_row-outstandingamount = rs_row-total.
  ENDMETHOD.

  METHOD fx_outstanding.
    DATA lv_local TYPE ty_amount.

    " The first FL01 in the report's sort order (valuation area 001, earliest flow date).
    LOOP AT it_flow INTO DATA(ls_flow) USING KEY deal
         WHERE deal_number = is_deal-rfha AND valuation_area = c_area-first AND zfs_flow = 'FL01'.
      EXIT.
    ENDLOOP.
    DATA(lv_found) = xsdbool( sy-subrc = 0 ).

    " The rate is determined even without an FL01: a rate and no FL01 means no row, as the report.
    cl_exchange_rates=>convert_to_local_currency(
      EXPORTING date             = mv_month_end
                foreign_amount   = COND ty_amount( WHEN lv_found = abap_true THEN ls_flow-nominal_amt ELSE 1 )
                foreign_currency = is_deal-wgschft
                local_currency   = c_currency
                rate_type        = c_rate_type
      IMPORTING local_amount     = lv_local ).
    rv_amount = COND #( WHEN lv_found = abap_true THEN lv_local ).
  ENDMETHOD.

  METHOD security_row.
    DATA lv_amount TYPE ty_amount.
    DATA lv_date   TYPE d.

    rs_row = new_row( is_deal ).
    CLEAR rs_row-dealnumber.

    IF is_deal-sgsart = c_product-bond.
      lv_amount = bond_outstanding( iv_security = is_deal-ranl it_flow = it_flow ).
      lv_date   = is_deal-s_edate.
    ELSEIF is_deal-sgsart IN it_tpm12_prod.
      rs_row-tpm12capturefailed = iv_tpm12_fail.
      DATA(ls_value) = VALUE #( it_tpm12[ security_id = is_deal-ranl ] OPTIONAL ).
      lv_amount = ls_value-amount.
      lv_date   = ls_value-maturity.
    ENDIF.

    IF lv_amount <> 0.
      rs_row-outstandingamount = abs( lv_amount ).
      rs_row-repaymentdate     = lv_date.
      place( EXPORTING iv_amount = rs_row-outstandingamount iv_date = lv_date CHANGING cs_row = rs_row ).
    ENDIF.
  ENDMETHOD.

  METHOD bond_outstanding.
    " The first FL04 of the security at any date (report rule), less; FL31/FL51 up to the month end, plus,
    " FL52 minus; in valuation area 002 FL51 minus and FL52 plus.
    LOOP AT it_flow INTO DATA(ls_flow) USING KEY security
         WHERE security_id = iv_security AND valuation_area = c_area-first AND zfs_flow = 'FL04'.
      rv_amount -= ls_flow-position_amt.
      EXIT.
    ENDLOOP.

    LOOP AT it_flow INTO ls_flow USING KEY security
         WHERE security_id = iv_security AND trldate <= mv_month_end.
      rv_amount += SWITCH ty_amount( ls_flow-valuation_area
                     WHEN c_area-first THEN SWITCH #( ls_flow-zfs_flow
                                                      WHEN 'FL31' OR 'FL51' THEN ls_flow-position_amt
                                                      WHEN 'FL52' THEN - ls_flow-position_amt )
                     WHEN c_area-second THEN SWITCH #( ls_flow-zfs_flow
                                                       WHEN 'FL51' THEN - ls_flow-position_amt
                                                       WHEN 'FL52' THEN ls_flow-position_amt ) ).
    ENDLOOP.
  ENDMETHOD.

  METHOD new_row.
    rs_row = VALUE #( companycode           = is_deal-bukrs
                      dealnumber            = is_deal-rfha
                      securityid            = is_deal-ranl
                      activity              = is_deal-activity
                      producttype           = is_deal-sgsart
                      producttypetext       = is_deal-ltx
                      transactiontype       = is_deal-sfhaart
                      transactiontypetext   = is_deal-xtext
                      customer              = is_deal-kontrh
                      customername          = is_deal-bp_name
                      startdate             = is_deal-dblfz
                      enddate               = is_deal-delfz
                      referenceinterestrate = is_deal-szsref ).
    SHIFT rs_row-customername LEFT DELETING LEADING '0'.
  ENDMETHOD.

  METHOD place.
    DATA(lv_days) = iv_date - mv_month_end.
    " Bucket limits overlap by one day: the lower bucket takes it (D12), as the report's deal loop.
    LOOP AT mt_bucket INTO DATA(ls_bucket) WHERE from_days <= lv_days AND to_days >= lv_days.
      ASSIGN COMPONENT |BUCKET{ ls_bucket-bucket }| OF STRUCTURE cs_row TO FIELD-SYMBOL(<lv_amount>).
      IF sy-subrc = 0.
        <lv_amount> += iv_amount.
        cs_row-total += iv_amount.
      ENDIF.
      RETURN.
    ENDLOOP.
  ENDMETHOD.

  METHOD filter_range.
    rt_range = VALUE #( it_filter[ name = iv_name ]-range OPTIONAL ).
  ENDMETHOD.

  METHOD apply_filter.
    LOOP AT it_filter INTO DATA(ls_filter).
      LOOP AT ct_result ASSIGNING FIELD-SYMBOL(<ls_row>).
        ASSIGN COMPONENT ls_filter-name OF STRUCTURE <ls_row> TO FIELD-SYMBOL(<lv_value>).
        IF sy-subrc = 0 AND <lv_value> NOT IN ls_filter-range.
          DELETE ct_result.
        ENDIF.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
