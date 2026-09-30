"! Query provider of ZFS_CE_AlmQtr2Report and ZFS_CE_AlmQtr2Period: /FS00/ALMR017 (Generate Quarterly
"! ALM2 Report, structural liquidity) as an API. Differs from the report where decided on 2026-09-28:
"! TB balances from ZFS_I_AlmGlBalance, TRM principal and accrual rows from ZCL_FS_ALM_TRMPRIN_QUERY and
"! ZCL_FS_ALM_TRMACCR_QUERY, manual rows from ZFS_T_ALM2_MAN, and the feeders /FS00/ALMR021 (CP and NCD
"! BENPOS), /FS00/ALMR018 (investments) and /FS00/ALMR024 (provisions) rebuilt here with their rules.
"! Technical fixes: a group's product, transaction type and portfolio lists select its amounts for every
"! source (the report ignored them for 09 and 64 and hard-coded portfolio 1000 for NCD), an amount goes
"! to exactly one bucket, a CP position is shared among its investors by units instead of repeated for
"! each, investment products are read for the company code, the cumulative rows total to their last
"! bucket, and a feeder without data gives zero instead of a dump. A feeder list that cannot be
"! captured fails soft: the groups of its sources are flagged SourceIncomplete.
CLASS zcl_fs_alm_qtr2rpt_query DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    INTERFACES if_rap_query_provider.

    TYPES:
      tt_report   TYPE STANDARD TABLE OF zfs_ce_almqtr2report WITH EMPTY KEY,
      ty_amount   TYPE zfs_ce_almqtr2report-total,
      tt_source_r TYPE RANGE OF /fs00/almdt0004,
      "! One amount of a feeder in one bucket, with the attributes a group selects on. TB and manual
      "! amounts belong to one group (group_id); the other feeders' to a source (group_id blank).
      "! int_type: '01' fixed / '02' variable of a TRM principal row (R015's reference-rate rule), else blank.
      BEGIN OF ty_item,
        group_id  TYPE /fs00/almdt0001,
        source    TYPE /fs00/almdt0004,
        product   TYPE vvsart,
        trtype    TYPE tb_sfhaart,
        portfolio TYPE rportb,
        int_type  TYPE /fs00/almdt0025,
        bucket    TYPE i,
        amount    TYPE ty_amount,
      END OF ty_item,
      tt_item TYPE STANDARD TABLE OF ty_item WITH EMPTY KEY
        WITH NON-UNIQUE SORTED KEY source COMPONENTS source
        WITH NON-UNIQUE SORTED KEY group COMPONENTS group_id.

    "! All report rows of a period: the groups sorted by ID, then the computed rows; empty for an invalid period.
    METHODS get_report
      IMPORTING iv_bukrs         TYPE bukrs
                iv_year          TYPE /fs00/almdt0032
                iv_month         TYPE /fs00/almdt0031
      RETURNING VALUE(rt_report) TYPE tt_report.
    "! The feeder amounts of a period in the ten ALM 2/3 buckets (sources 11, 64, 09, CP, NCD, 59, 60; not TB or
    "! manual, which depend on the report format), with the sources whose capture failed. Shared with the ALM 3
    "! report (/FS00/ALMR022 uses the same feeders). Empty for an invalid period.
    METHODS get_items
      IMPORTING iv_bukrs      TYPE bukrs
                iv_year       TYPE /fs00/almdt0032
                iv_month      TYPE /fs00/almdt0031
      EXPORTING et_item       TYPE tt_item
                et_incomplete TYPE tt_source_r.
    "! Saved snapshot and ALM 2 lock of a period.
    METHODS get_period
      IMPORTING iv_bukrs         TYPE bukrs
                iv_year          TYPE /fs00/almdt0032
                iv_month         TYPE /fs00/almdt0031
      RETURNING VALUE(rs_period) TYPE zfs_ce_almqtr2period.

  PRIVATE SECTION.
    TYPES:
      BEGIN OF ty_work.
        INCLUDE TYPE zfs_ce_almqtr2report.
    TYPES:
        grp3 TYPE /fs00/almdt0002,
        grp4 TYPE /fs00/almdt0002,
        grp5 TYPE /fs00/almdt0002,
      END OF ty_work,
      tt_work        TYPE STANDARD TABLE OF ty_work WITH EMPTY KEY,
      tt_product_r   TYPE RANGE OF vvsart,
      "! A comma-separated list of /FS00/ALMTR002 (products, transaction types, portfolios) as a range.
      ty_list_value  TYPE c LENGTH 20,
      tt_list_r      TYPE RANGE OF ty_list_value,
      tt_security_r  TYPE RANGE OF vvranlw,
      BEGIN OF ty_bucket,
        bucket    TYPE i,
        from_days TYPE i,
        to_days   TYPE i,
        from_date TYPE d,
        to_date   TYPE d,
      END OF ty_bucket,
      tt_bucket TYPE STANDARD TABLE OF ty_bucket WITH EMPTY KEY,
      "! A row of RTPM_TRL_SHOW_POSITION_VALUES (TRLS_POSITION_VALUE_ATTR_TXT), the fields used.
      BEGIN OF ty_position,
        company_code    TYPE bukrs,
        security_id     TYPE vvranlw,
        deal_number     TYPE tb_rfha,
        product_type    TYPE vvsart,
        valuation_area  TYPE tpm_val_area,
        valuation_class TYPE tpm_val_class,
        amaqu_val_pc    TYPE fti_amaqu_val_pc,
        book_val_pc     TYPE fti_book_val_pc,
        market_value    TYPE fti_market_mc,
        mat_term_end    TYPE dendlfz,
      END OF ty_position,
      tt_position TYPE STANDARD TABLE OF ty_position WITH EMPTY KEY
        WITH NON-UNIQUE SORTED KEY security COMPONENTS security_id,
      "! The latest BENPOS holding of an investor in a class ID (ZTRM_T0008 / ZTRM_T0009).
      BEGIN OF ty_holding,
        ranl       TYPE vvranlw,
        investor   TYPE bu_partner,
        recdate    TYPE d,
        units      TYPE tpm_units,
        face_value TYPE ztrm_t0009-zfacevalue,
        source     TYPE /fs00/almdt0004,
      END OF ty_holding,
      tt_holding TYPE STANDARD TABLE OF ty_holding WITH EMPTY KEY,
      BEGIN OF ty_flow,
        security_id    TYPE vvranlw,
        deal_number    TYPE tb_rfha,
        valuation_area TYPE tpm_val_area,
        zfs_flow       TYPE zdt_flow_cat,
        flowtype       TYPE tpm_dis_flowtype,
        trldate        TYPE d,
        position_amt   TYPE tpm_position_amt,
        portfolio      TYPE rportb,
      END OF ty_flow,
      " The order of /FS00/ALMR021's SORT, so that "the first flow" is the same flow.
      tt_flow TYPE STANDARD TABLE OF ty_flow WITH EMPTY KEY
        WITH NON-UNIQUE SORTED KEY security COMPONENTS security_id deal_number valuation_area zfs_flow trldate,
      "! A row of the amortisation log /FSPL/TRM_R0214, the fields used.
      BEGIN OF ty_amort,
        ranl        TYPE vvranlw,
        update_type TYPE tpm_dis_flowtype,
        calc_frm    TYPE d,
        amt         TYPE tb_limit_amount,
        rev_amt     TYPE tb_limit_amount,
      END OF ty_amort,
      tt_amort TYPE STANDARD TABLE OF ty_amort WITH EMPTY KEY
        WITH NON-UNIQUE SORTED KEY ranl COMPONENTS ranl.

    CONSTANTS:
      BEGIN OF c_product,
        cp  TYPE vvsart VALUE '15A',
        ncd TYPE vvsart VALUE '15D',
      END OF c_product,
      BEGIN OF c_source,
        tb        TYPE /fs00/almdt0004 VALUE '99',
        manual    TYPE /fs00/almdt0004 VALUE '92',
        principal TYPE /fs00/almdt0004 VALUE '11',
        accrual   TYPE /fs00/almdt0004 VALUE '64',
        invest    TYPE /fs00/almdt0004 VALUE '09',
        npa       TYPE /fs00/almdt0004 VALUE '59',
        standard  TYPE /fs00/almdt0004 VALUE '60',
      END OF c_source,
      BEGIN OF c_area,
        first  TYPE tpm_val_area VALUE '001',
        second TYPE tpm_val_area VALUE '002',
      END OF c_area,
      c_bucket_count TYPE i VALUE 10,
      " IDs, names and XBRL codes of the rows /FS00/ALMR017 computes (report row labels, not UI texts).
      BEGIN OF c_row,
        outflow     TYPE /fs00/almdt0001 VALUE 'SA:99:99:99:99',
        inflow      TYPE /fs00/almdt0001 VALUE 'SB:99:99:99:99',
        cum_outflow TYPE /fs00/almdt0001 VALUE 'SA:99:99:99:99_A1',
        mismatch    TYPE /fs00/almdt0001 VALUE 'SC',
        cum_mismatch TYPE /fs00/almdt0001 VALUE 'SD',
        pct         TYPE /fs00/almdt0001 VALUE 'SE',
        cum_pct     TYPE /fs00/almdt0001 VALUE 'SF',
      END OF c_row.

    DATA mv_bukrs     TYPE bukrs.
    DATA mv_year      TYPE /fs00/almdt0032.
    DATA mv_month     TYPE /fs00/almdt0031.
    "! Last day of the month (the report's gv_date).
    DATA mv_month_end TYPE d.
    DATA mt_bucket    TYPE tt_bucket.
    DATA mt_item      TYPE tt_item.
    "! Sources whose amounts may be missing because a feeder list could not be captured.
    DATA mt_incomplete TYPE tt_source_r.

    METHODS read_buckets.
    "! Bucket (1-10) whose day range holds the days after the month end; 0 when none (lower bucket on overlap).
    METHODS bucket_by_days
      IMPORTING iv_date          TYPE d
      RETURNING VALUE(rv_bucket) TYPE i.
    "! Bucket (1-10) whose date range holds the date; 0 when none (lower bucket on overlap).
    METHODS bucket_by_date
      IMPORTING iv_date          TYPE d
      RETURNING VALUE(rv_bucket) TYPE i.
    METHODS add_item
      IMPORTING iv_group     TYPE /fs00/almdt0001 OPTIONAL
                iv_source    TYPE /fs00/almdt0004 OPTIONAL
                iv_product   TYPE vvsart OPTIONAL
                iv_trtype    TYPE tb_sfhaart OPTIONAL
                iv_portfolio TYPE rportb OPTIONAL
                iv_int_type  TYPE /fs00/almdt0025 OPTIONAL
                iv_bucket    TYPE i
                iv_amount    TYPE ty_amount.
    "! Sources 11 and 64: the rows of the TRM principal O/S and accrual APIs, bucket by bucket.
    METHODS read_trm.
    "! Positions of RTPM_TRL_SHOW_POSITION_VALUES (valuation area 001, month end), deals and securities.
    METHODS read_positions
      IMPORTING it_product         TYPE tt_product_r
      EXPORTING et_position        TYPE tt_position
                ev_failed          TYPE abap_boolean.
    "! Source 09 (/FS00/ALMR018) and CP sources (/FS00/ALMR021 CP) from one position capture.
    METHODS read_investments_and_cp.
    "! The latest holding per class ID and investor with its ALM source (/FS00/ALMR021 rules).
    METHODS read_holdings
      IMPORTING iv_product        TYPE vvsart
                iv_group_code     TYPE /fs00/almtr008-zgrp_cd
      RETURNING VALUE(rt_holding) TYPE tt_holding.
    "! NCD sources (/FS00/ALMR021 NCD): amortised O/S per ISIN shared by face value x units.
    METHODS read_ncd.
    METHODS read_amort_log
      IMPORTING it_security     TYPE tt_security_r
      EXPORTING et_amort        TYPE tt_amort
                ev_failed       TYPE abap_boolean.
    "! Sources 59 and 60 (/FS00/ALMR024).
    METHODS read_provisions.
    METHODS to_range
      IMPORTING iv_list         TYPE csequence
      RETURNING VALUE(rt_range) TYPE tt_list_r.
    METHODS put
      IMPORTING iv_bucket TYPE i
                iv_amount TYPE ty_amount
      CHANGING  cs_row    TYPE ty_work.
    METHODS get
      IMPORTING iv_bucket        TYPE i
                is_row           TYPE ty_work
      RETURNING VALUE(rv_amount) TYPE ty_amount.
    METHODS total
      CHANGING cs_row TYPE ty_work.
    "! Adds (or, with iv_sign = -1, subtracts) the buckets of is_from to cs_to.
    METHODS add
      IMPORTING is_from TYPE ty_work
                iv_sign TYPE i DEFAULT 1
      CHANGING  cs_to   TYPE ty_work.
    METHODS level_totals
      CHANGING ct_work TYPE tt_work.
    "! Adds the children of every parent of a level (4, 3 or 1) to it.
    METHODS roll_up
      IMPORTING iv_level TYPE i
      CHANGING  ct_work  TYPE tt_work.
    METHODS sub_totals
      CHANGING ct_work TYPE tt_work.
    METHODS computed_rows
      CHANGING ct_work TYPE tt_work.
    METHODS apply_filter
      IMPORTING it_filter TYPE if_rap_query_filter=>tt_name_range_pairs
      CHANGING  ct_report TYPE tt_report.
ENDCLASS.



CLASS zcl_fs_alm_qtr2rpt_query IMPLEMENTATION.

  METHOD if_rap_query_provider~select.
    DATA: lv_bukrs  TYPE bukrs,
          lv_year   TYPE /fs00/almdt0032,
          lv_month  TYPE /fs00/almdt0031,
          lt_filter TYPE if_rap_query_filter=>tt_name_range_pairs.

    TRY.
        lt_filter = io_request->get_filter( )->get_as_ranges( ).
      CATCH cx_rap_query_filter_no_range.
        " Not expressible as ranges: answer with no rows rather than with unfiltered data.
        CLEAR lt_filter.
        DATA(lv_unsupported) = abap_true.
    ENDTRY.

    IF io_request->get_entity_id( ) = 'ZFS_CE_ALMQTR2PERIOD'.
      " One period, addressed by its key (a GET by key arrives as three EQ ranges).
      DATA lt_period TYPE STANDARD TABLE OF zfs_ce_almqtr2period WITH EMPTY KEY.
      DATA(lv_keys) = 0.
      LOOP AT lt_filter INTO DATA(ls_key) WHERE name = 'COMPANYCODE' OR name = 'FISCALYEAR' OR name = 'FISCALPERIOD'.
        IF lines( ls_key-range ) = 1 AND ls_key-range[ 1 ]-sign = 'I' AND ls_key-range[ 1 ]-option = 'EQ'.
          lv_keys = lv_keys + 1.
          CASE ls_key-name.
            WHEN 'COMPANYCODE'.
              lv_bukrs = ls_key-range[ 1 ]-low.
            WHEN 'FISCALYEAR'.
              lv_year = ls_key-range[ 1 ]-low.
            WHEN 'FISCALPERIOD'.
              lv_month = ls_key-range[ 1 ]-low.
          ENDCASE.
        ENDIF.
      ENDLOOP.
      IF lv_unsupported = abap_false AND lv_keys = 3
         AND zcl_fs_alm_qtrrpt_query=>valid_period( iv_bukrs = lv_bukrs iv_year = lv_year iv_month = lv_month ) = abap_true.
        APPEND get_period( iv_bukrs = lv_bukrs iv_year = lv_year iv_month = lv_month ) TO lt_period.
      ENDIF.
      IF io_request->is_total_numb_of_rec_requested( ).
        io_response->set_total_number_of_records( lines( lt_period ) ).
      ENDIF.
      IF io_request->is_data_requested( ).
        io_request->get_paging( ).
        io_request->get_sort_elements( ).
        io_response->set_data( lt_period ).
      ENDIF.
      RETURN.
    ENDIF.

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

    DATA(lt_report) = COND tt_report( WHEN lv_unsupported = abap_false
                                      THEN get_report( iv_bukrs = lv_bukrs iv_year = lv_year iv_month = lv_month ) ).
    apply_filter( EXPORTING it_filter = lt_filter CHANGING ct_report = lt_report ).

    DATA(lt_sort) = VALUE abap_sortorder_tab( FOR ls_sort IN io_request->get_sort_elements( )
                                              ( name = to_upper( ls_sort-element_name ) descending = ls_sort-descending ) ).
    IF lt_sort IS NOT INITIAL.
      SORT lt_report BY (lt_sort).
    ENDIF.

    IF io_request->is_total_numb_of_rec_requested( ).
      io_response->set_total_number_of_records( lines( lt_report ) ).
    ENDIF.
    IF io_request->is_data_requested( ).
      DATA lt_page TYPE tt_report.
      DATA(lv_offset) = io_request->get_paging( )->get_offset( ).
      DATA(lv_size)   = io_request->get_paging( )->get_page_size( ).
      LOOP AT lt_report INTO DATA(ls_row) FROM lv_offset + 1.
        IF lv_size <> if_rap_query_paging=>page_size_unlimited AND lines( lt_page ) >= lv_size.
          EXIT.
        ENDIF.
        APPEND ls_row TO lt_page.
      ENDLOOP.
      io_response->set_data( lt_page ).
    ENDIF.
  ENDMETHOD.

  METHOD get_report.
    DATA: lt_work TYPE tt_work,
          ls_work TYPE ty_work.

    IF zcl_fs_alm_qtrrpt_query=>valid_period( iv_bukrs = iv_bukrs iv_year = iv_year iv_month = iv_month ) = abap_false.
      RETURN.
    ENDIF.
    " Feeders, each once per request.
    get_items( EXPORTING iv_bukrs = iv_bukrs iv_year = iv_year iv_month = iv_month
               IMPORTING et_item  = mt_item  et_incomplete = mt_incomplete ).

    " Every ALM 2 report format group is a report row (the report selects them all as well).
    SELECT zgrp_id, zgrp_name, zsrc, zxbrl, zproduct, zttype, zportfolio, zint_split, zneg, zgrp3, zgrp4, zgrp5
      FROM /fs00/almtr002 INTO TABLE @DATA(lt_grp).   "#EC CI_NOWHERE
    SORT lt_grp BY zgrp_id.

    SELECT grp_id, bucket, amount FROM zfs_t_alm2_man
      WHERE bukrs = @iv_bukrs AND zyear = @iv_year AND zmonth = @iv_month
      INTO TABLE @DATA(lt_manual).
    LOOP AT lt_manual INTO DATA(ls_manual).
      add_item( iv_group = ls_manual-grp_id iv_source = c_source-manual
                iv_bucket = CONV i( ls_manual-bucket ) iv_amount = CONV #( ls_manual-amount ) ).
    ENDLOOP.
    " TB: accounts mapped to an ALM 2 group with source 99, balance at the month end (the report's R010 with p_as).
    SELECT zgl_id, zgr_id, zbu_id, ztype3 FROM /fs00/almtr018
      WHERE zcal = @c_source-tb AND zgl_id <> @space
      INTO TABLE @DATA(lt_map).
    IF lt_map IS NOT INITIAL.
      DATA lr_gl TYPE RANGE OF hkont.
      lr_gl = VALUE #( FOR m IN lt_map ( sign = 'I' option = 'EQ' low = m-zgl_id ) ).
      SELECT GLAccount, Balance
        FROM zfs_i_almglbalance( p_companycode = @iv_bukrs, p_keydate = @mv_month_end )
        WHERE GLAccount IN @lr_gl
        INTO TABLE @DATA(lt_balance).
      SORT lt_balance BY GLAccount.
      LOOP AT lt_map INTO DATA(ls_map).
        READ TABLE lt_balance INTO DATA(ls_balance) WITH KEY GLAccount = ls_map-zgl_id BINARY SEARCH.
        IF sy-subrc = 0.
          add_item( iv_group  = ls_map-zgr_id
                    iv_source = c_source-tb
                    iv_bucket = CONV i( ls_map-zbu_id )
                    iv_amount = CONV #( ls_balance-Balance * COND i( WHEN ls_map-ztype3 = '02' THEN -1 ELSE 1 ) ) ).
        ENDIF.
      ENDLOOP.
    ENDIF.

    LOOP AT lt_grp INTO DATA(ls_grp).
      CLEAR ls_work.
      ls_work-GroupId         = ls_grp-zgrp_id.
      ls_work-GroupName       = ls_grp-zgrp_name.
      ls_work-Source          = ls_grp-zsrc.
      ls_work-XbrlCode        = ls_grp-zxbrl.
      ls_work-Product         = ls_grp-zproduct.
      ls_work-TransactionType = ls_grp-zttype.
      ls_work-Portfolio       = ls_grp-zportfolio.
      ls_work-InterestSplit   = xsdbool( ls_grp-zint_split IS NOT INITIAL ).
      ls_work-Negative        = xsdbool( ls_grp-zneg IS NOT INITIAL ).
      ls_work-grp3 = ls_grp-zgrp3.
      ls_work-grp4 = ls_grp-zgrp4.
      ls_work-grp5 = ls_grp-zgrp5.
      " Row styles as the report's colours (C300, C700, C100).
      IF ls_grp-zgrp_id+3(11) = '99:99:99:99'.
        ls_work-RowStyle = 'SUBTOTAL'.
      ELSEIF ls_grp-zgrp_id = 'SA' OR ls_grp-zgrp_id = 'SB'.
        ls_work-RowStyle = 'HEADING'.
      ENDIF.
      IF ls_grp-zgrp_id+6(8) = '00:00:00'.
        ls_work-RowStyle = 'LEVEL1'.
      ENDIF.

      CASE ls_grp-zsrc.
        WHEN space OR c_source-manual.
          " TB (a group without a source: its mapped accounts; shown as source 99, as the report) and manual amounts.
          DATA(lv_own) = COND /fs00/almdt0004( WHEN ls_grp-zsrc IS INITIAL THEN c_source-tb ELSE ls_grp-zsrc ).
          LOOP AT mt_item INTO DATA(ls_own) USING KEY group WHERE group_id = ls_grp-zgrp_id.
            IF ls_own-source <> lv_own.
              CONTINUE.
            ENDIF.
            ls_work-Source = ls_own-source.
            put( EXPORTING iv_bucket = ls_own-bucket iv_amount = ls_own-amount CHANGING cs_row = ls_work ).
          ENDLOOP.
        WHEN OTHERS.
          " The feeder amounts of the group's source, restricted by its product, transaction type
          " and portfolio lists (all when a list is blank).
          DATA(lr_product)   = to_range( ls_grp-zproduct ).
          DATA(lr_trtype)    = to_range( ls_grp-zttype ).
          DATA(lr_portfolio) = to_range( ls_grp-zportfolio ).
          LOOP AT mt_item INTO DATA(ls_item) USING KEY source WHERE source = ls_grp-zsrc.
            IF ls_item-group_id IS INITIAL AND ls_item-product IN lr_product AND ls_item-trtype IN lr_trtype AND ls_item-portfolio IN lr_portfolio.
              put( EXPORTING iv_bucket = ls_item-bucket iv_amount = ls_item-amount CHANGING cs_row = ls_work ).
            ENDIF.
          ENDLOOP.
          ls_work-SourceIncomplete = xsdbool( mt_incomplete IS NOT INITIAL AND ls_grp-zsrc IN mt_incomplete ).
      ENDCASE.

      " As the report: every bucket as an absolute amount before the totals.
      DO c_bucket_count TIMES.
        ASSIGN COMPONENT |BUCKET{ sy-index }| OF STRUCTURE ls_work TO FIELD-SYMBOL(<lv_bucket>).
        <lv_bucket> = abs( <lv_bucket> ).
      ENDDO.
      total( CHANGING cs_row = ls_work ).
      APPEND ls_work TO lt_work.
    ENDLOOP.

    level_totals( CHANGING ct_work = lt_work ).
    sub_totals( CHANGING ct_work = lt_work ).
    computed_rows( CHANGING ct_work = lt_work ).
    rt_report = CORRESPONDING #( lt_work ).
  ENDMETHOD.

  METHOD get_items.
    CLEAR: et_item, et_incomplete, mt_item, mt_incomplete.
    IF zcl_fs_alm_qtrrpt_query=>valid_period( iv_bukrs = iv_bukrs iv_year = iv_year iv_month = iv_month ) = abap_false.
      RETURN.
    ENDIF.
    mv_bukrs     = iv_bukrs.
    mv_year      = iv_year.
    mv_month     = iv_month.
    mv_month_end = zcl_fs_alm_qtrrpt_query=>last_day( iv_year = iv_year iv_month = iv_month ).
    read_buckets( ).
    read_trm( ).
    read_investments_and_cp( ).
    read_ncd( ).
    read_provisions( ).
    et_item       = mt_item.
    et_incomplete = mt_incomplete.
  ENDMETHOD.

  METHOD read_buckets.
    DATA lt_buck TYPE /fs00/almtt001.

    DATA(lv_key) = CONV dats( mv_month_end + 1 ).
    CALL FUNCTION '/FS00/ALMFM001'
      EXPORTING
        im_type = '02'
        im_date = lv_key
      IMPORTING
        ex_buck = lt_buck.
    " The FM returns the day limits as characters; convert once.
    mt_bucket = VALUE #( FOR b IN lt_buck ( bucket    = b-zbuc
                                            from_days = b-zf_days
                                            to_days   = b-zt_days
                                            from_date = b-zf_date
                                            to_date   = b-zt_date ) ).
    SORT mt_bucket BY bucket.
  ENDMETHOD.

  METHOD bucket_by_days.
    DATA(lv_days) = iv_date - mv_month_end.
    LOOP AT mt_bucket INTO DATA(ls_bucket) WHERE from_days <= lv_days AND to_days >= lv_days.
      rv_bucket = ls_bucket-bucket.
      RETURN.
    ENDLOOP.
  ENDMETHOD.

  METHOD bucket_by_date.
    LOOP AT mt_bucket INTO DATA(ls_bucket) WHERE from_date <= iv_date AND to_date >= iv_date.
      rv_bucket = ls_bucket-bucket.
      RETURN.
    ENDLOOP.
  ENDMETHOD.

  METHOD add_item.
    IF iv_bucket BETWEEN 1 AND c_bucket_count AND iv_amount <> 0.
      APPEND VALUE #( group_id = iv_group source = iv_source product = iv_product trtype = iv_trtype portfolio = iv_portfolio
                      int_type = iv_int_type bucket = iv_bucket amount = iv_amount ) TO mt_item.
    ENDIF.
  ENDMETHOD.

  METHOD read_trm.
    DATA(lt_principal) = NEW zcl_fs_alm_trmprin_query( )->get_rows( iv_bukrs = mv_bukrs iv_year = mv_year iv_month = mv_month ).
    LOOP AT lt_principal INTO DATA(ls_principal).
      IF ls_principal-Tpm12CaptureFailed = abap_true.
        APPEND VALUE #( sign = 'I' option = 'EQ' low = c_source-principal ) TO mt_incomplete.
      ENDIF.
      DO c_bucket_count TIMES.
        ASSIGN COMPONENT |BUCKET{ sy-index WIDTH = 2 ALIGN = RIGHT PAD = '0' }| OF STRUCTURE ls_principal TO FIELD-SYMBOL(<lv_principal>).
        IF sy-subrc = 0.
          add_item( iv_source   = c_source-principal iv_product = ls_principal-ProductType iv_trtype = ls_principal-TransactionType
                    iv_int_type = ls_principal-FixedOrVariable(2)
                    iv_bucket   = sy-index           iv_amount  = <lv_principal> ).
        ENDIF.
      ENDDO.
    ENDLOOP.

    DATA(lt_accrual) = NEW zcl_fs_alm_trmaccr_query( )->get_rows( iv_bukrs = mv_bukrs iv_year = mv_year iv_month = mv_month ).
    LOOP AT lt_accrual INTO DATA(ls_accrual).
      DO c_bucket_count TIMES.
        ASSIGN COMPONENT |BUCKET{ sy-index WIDTH = 2 ALIGN = RIGHT PAD = '0' }| OF STRUCTURE ls_accrual TO FIELD-SYMBOL(<lv_accrual>).
        IF sy-subrc = 0.
          add_item( iv_source = c_source-accrual iv_product = ls_accrual-ProductType iv_trtype = ls_accrual-TransactionType
                    iv_bucket = sy-index         iv_amount  = <lv_accrual> ).
        ENDIF.
      ENDDO.
    ENDLOOP.
  ENDMETHOD.

  METHOD read_positions.
    FIELD-SYMBOLS <lt_data> TYPE ANY TABLE.
    DATA lr_bukrs TYPE RANGE OF bukrs.
    DATA lr_varea TYPE RANGE OF tpm_val_area.

    CLEAR: et_position, ev_failed.
    lr_bukrs = VALUE #( ( sign = 'I' option = 'EQ' low = mv_bukrs ) ).
    lr_varea = VALUE #( ( sign = 'I' option = 'EQ' low = c_area-first ) ).
    " No released API gives the TPM12 position values: run the standard list with the selection of
    " /FS00/ALMR018 and /FS00/ALMR021 and take its ALV data instead of displaying it (as L-615).
    TRY.
        cl_salv_bs_runtime_info=>set( display  = abap_false
                                      metadata = abap_false
                                      data     = abap_true ).
        SUBMIT rtpm_trl_show_position_values
          WITH p_sec     = abap_true
          WITH p_dea     = abap_true
          WITH pm_date   = mv_month_end
          WITH so_bukrs IN lr_bukrs
          WITH so_varea IN lr_varea
          WITH so_pt    IN it_product
          EXPORTING LIST TO MEMORY AND RETURN.
        cl_salv_bs_runtime_info=>get_data_ref( IMPORTING r_data = DATA(lr_data) ).
        IF lr_data IS BOUND.
          ASSIGN lr_data->* TO <lt_data>.
          MOVE-CORRESPONDING <lt_data> TO et_position.
        ENDIF.
      CATCH cx_salv_bs_sc_runtime_info.
        " Fail soft: no positions; the groups of the sources that need them are flagged.
        ev_failed = abap_true.
    ENDTRY.
    cl_salv_bs_runtime_info=>clear_all( ).
    DELETE et_position WHERE company_code <> mv_bukrs OR valuation_area <> c_area-first.
  ENDMETHOD.

  METHOD read_investments_and_cp.
    DATA lt_position TYPE tt_position.
    DATA lv_failed   TYPE abap_boolean.

    " /FS00/ALMR018: the products flagged for ALM 2 principal in the company code.
    SELECT zprd_type FROM /fs00/almtr026
      WHERE zbukrs = @mv_bukrs AND zprinc_alm2 = @abap_true
      INTO TABLE @DATA(lt_invest).
    DATA(lr_invest) = VALUE tt_product_r( FOR p IN lt_invest ( sign = 'I' option = 'EQ' low = p-zprd_type ) ).
    DATA(lt_cp) = read_holdings( iv_product = c_product-cp iv_group_code = 'A4' ).
    DELETE lt_cp WHERE source IS INITIAL.

    DATA(lr_product) = lr_invest.
    IF lt_cp IS NOT INITIAL.
      APPEND VALUE #( sign = 'I' option = 'EQ' low = c_product-cp ) TO lr_product.
    ENDIF.
    IF lr_product IS INITIAL.
      RETURN.
    ENDIF.
    read_positions( EXPORTING it_product = lr_product IMPORTING et_position = lt_position ev_failed = lv_failed ).
    IF lv_failed = abap_true.
      APPEND VALUE #( sign = 'I' option = 'EQ' low = c_source-invest ) TO mt_incomplete.
      LOOP AT lt_cp INTO DATA(ls_failed_cp).
        APPEND VALUE #( sign = 'I' option = 'EQ' low = ls_failed_cp-source ) TO mt_incomplete.
      ENDLOOP.
      RETURN.
    ENDIF.

    " Investments (source 09).
    IF lr_invest IS NOT INITIAL.
      " Deal end dates (20A) and class end dates (22A/22B) only for the positions that need them.
      DATA lr_deal  TYPE RANGE OF tb_rfha.
      DATA lr_class TYPE tt_security_r.
      lr_deal  = VALUE #( FOR d IN lt_position WHERE ( product_type = '20A' AND deal_number IS NOT INITIAL )
                          ( sign = 'I' option = 'EQ' low = d-deal_number ) ).
      lr_class = VALUE #( FOR c IN lt_position WHERE ( ( product_type = '22A' OR product_type = '22B' ) AND security_id IS NOT INITIAL )
                          ( sign = 'I' option = 'EQ' low = c-security_id ) ).
      SORT: lr_deal BY low, lr_class BY low.
      DELETE ADJACENT DUPLICATES FROM: lr_deal COMPARING low, lr_class COMPARING low.
      IF lr_deal IS NOT INITIAL.
        SELECT rfha, delfz FROM /fs00/cds0001
          WHERE bukrs = @mv_bukrs AND sgsart = '20A' AND rfha IN @lr_deal
          INTO TABLE @DATA(lt_mm).
        SORT lt_mm BY rfha.
        DELETE ADJACENT DUPLICATES FROM lt_mm COMPARING rfha.
      ENDIF.
      IF lr_class IS NOT INITIAL.
        SELECT ranl, end_dt FROM /fs00/cds0004
          WHERE ranl IN @lr_class
          INTO TABLE @DATA(lt_class).
        SORT lt_class BY ranl.
        DELETE ADJACENT DUPLICATES FROM lt_class COMPARING ranl.
      ENDIF.

      LOOP AT lt_position INTO DATA(ls_position) WHERE product_type IN lr_invest.
        DATA(lv_date)   = VALUE d( ).
        DATA(lv_amount) = VALUE ty_amount( ).
        CASE ls_position-product_type.
          WHEN '20A'.
            READ TABLE lt_mm INTO DATA(ls_mm) WITH KEY rfha = ls_position-deal_number BINARY SEARCH.
            IF sy-subrc = 0.
              lv_date = ls_mm-delfz.
            ENDIF.
            lv_amount = COND #( WHEN ls_position-market_value IS NOT INITIAL THEN ls_position-market_value ELSE ls_position-book_val_pc ).
          WHEN '21A'.
            " Mutual funds: redeemable at once, the first bucket.
            lv_date   = mv_month_end + 1.
            lv_amount = COND #( WHEN ls_position-market_value IS NOT INITIAL THEN ls_position-market_value ELSE ls_position-book_val_pc ).
          WHEN '22A' OR '22B'.
            READ TABLE lt_class INTO DATA(ls_class) WITH KEY ranl = ls_position-security_id BINARY SEARCH.
            IF sy-subrc = 0.
              lv_date = ls_class-end_dt.
            ENDIF.
            lv_amount = COND #( WHEN ls_position-market_value IS INITIAL OR ls_position-valuation_class = '0005'
                                THEN ls_position-book_val_pc ELSE ls_position-market_value ).
          WHEN OTHERS.
            " Flagged products without a rule in the report contribute nothing.
            CONTINUE.
        ENDCASE.
        add_item( iv_source = c_source-invest iv_product = ls_position-product_type
                  iv_bucket = bucket_by_date( lv_date ) iv_amount = lv_amount ).
      ENDLOOP.
    ENDIF.

    " CP (/FS00/ALMR021 rb_cp): the security's amortised acquisition value at its maturity, shared by
    " the investors of the latest BENPOS by units (the report put the whole value on every investor).
    LOOP AT lt_cp INTO DATA(ls_cp) GROUP BY ls_cp-ranl INTO DATA(lv_ranl).
      DATA(lv_value)    = VALUE ty_amount( ).
      DATA(lv_maturity) = VALUE d( ).
      LOOP AT lt_position INTO ls_position USING KEY security WHERE security_id = lv_ranl.
        IF ls_position-product_type <> c_product-cp.
          CONTINUE.
        ENDIF.
        lv_value = lv_value + ls_position-amaqu_val_pc.
        IF lv_maturity IS INITIAL.
          lv_maturity = ls_position-mat_term_end.
        ENDIF.
      ENDLOOP.
      lv_value = abs( lv_value ).
      DATA(lv_units)   = REDUCE tpm_units( INIT u = CONV tpm_units( 0 ) FOR h IN GROUP lv_ranl NEXT u = u + h-units ).
      DATA(lv_holders) = REDUCE i( INIT n = 0 FOR h IN GROUP lv_ranl NEXT n = n + 1 ).
      DATA(lv_bucket)  = bucket_by_days( lv_maturity ).
      LOOP AT GROUP lv_ranl INTO DATA(ls_holder).
        DATA(lv_share) = COND decfloat34( WHEN lv_units <> 0 THEN ls_holder-units / lv_units ELSE CONV decfloat34( 1 ) / lv_holders ).
        add_item( iv_source = ls_holder-source iv_product = c_product-cp
                  iv_bucket = lv_bucket        iv_amount  = CONV #( lv_value * lv_share ) ).
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD read_holdings.
    " /FS00/CDS0004 class IDs of the product with their BENPOS records up to the month end.
    CASE iv_product.
      WHEN c_product-cp.
        SELECT a~ranl, b~zbp_inv AS investor, b~zrecdate AS recdate, b~zposition AS units, b~zfacevalue AS face_value
          FROM /fs00/cds0004 AS a
          INNER JOIN ztrm_t0008 AS b ON b~zisin = a~isin
          WHERE a~product_type = @iv_product
            AND b~zrecdate    <= @mv_month_end
          INTO CORRESPONDING FIELDS OF TABLE @rt_holding.
      WHEN c_product-ncd.
        SELECT a~ranl, b~zbp_inv AS investor, b~zrecdate AS recdate, b~zposition AS units, b~zfacevalue AS face_value
          FROM /fs00/cds0004 AS a
          INNER JOIN ztrm_t0009 AS b ON b~zisin = a~isin
          WHERE a~product_type = @iv_product
            AND b~zrecdate    <= @mv_month_end
          INTO CORRESPONDING FIELDS OF TABLE @rt_holding.
    ENDCASE.
    " The latest record per class ID and investor.
    SORT rt_holding BY ranl investor recdate DESCENDING.
    DELETE ADJACENT DUPLICATES FROM rt_holding COMPARING ranl investor.
    IF rt_holding IS INITIAL.
      RETURN.
    ENDIF.

    " Source: /FS00/ALMTR008 row of the group code whose Excel source is '<BP group>-<segment>'. A BP group
    " with several segments in /FS00/ALMTR029 takes the first that has a source (the report's join
    " picked one at random).
    DATA lr_investor TYPE RANGE OF bu_partner.
    lr_investor = VALUE #( FOR i IN rt_holding WHERE ( investor IS NOT INITIAL ) ( sign = 'I' option = 'EQ' low = i-investor ) ).
    IF lr_investor IS INITIAL.
      RETURN.
    ENDIF.
    SORT lr_investor BY low.
    DELETE ADJACENT DUPLICATES FROM lr_investor COMPARING low.
    SELECT partner, grp FROM bp3010
      WHERE grp_typ = '801' AND partner IN @lr_investor
      INTO TABLE @DATA(lt_bp_group).
    SORT lt_bp_group BY partner.
    SELECT zbp_grp, zsegment FROM /fs00/almtr029 INTO TABLE @DATA(lt_segment).   "#EC CI_NOWHERE
    SORT lt_segment BY zbp_grp zsegment.
    SELECT zsrc, zexl_src FROM /fs00/almtr008
      WHERE zgrp_cd = @iv_group_code AND zexl_src <> @space
      INTO TABLE @DATA(lt_source).
    SORT lt_source BY zexl_src.

    LOOP AT rt_holding ASSIGNING FIELD-SYMBOL(<ls_holding>) WHERE investor IS NOT INITIAL.
      READ TABLE lt_bp_group INTO DATA(ls_bp_group) WITH KEY partner = <ls_holding>-investor BINARY SEARCH.
      IF sy-subrc <> 0.
        CONTINUE.
      ENDIF.
      LOOP AT lt_segment INTO DATA(ls_segment) WHERE zbp_grp = ls_bp_group-grp.
        READ TABLE lt_source INTO DATA(ls_source) WITH KEY zexl_src = |{ ls_bp_group-grp }-{ ls_segment-zsegment }| BINARY SEARCH.
        IF sy-subrc = 0.
          <ls_holding>-source = ls_source-zsrc.
          EXIT.
        ENDIF.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD read_ncd.
    DATA lt_amort  TYPE tt_amort.
    DATA lt_flow   TYPE tt_flow.
    DATA lv_failed TYPE abap_boolean.

    " Holdings without an ALM source never reach a group: nothing to compute for them.
    DATA(lt_ncd) = read_holdings( iv_product = c_product-ncd iv_group_code = 'A3' ).
    DELETE lt_ncd WHERE source IS INITIAL.
    IF lt_ncd IS INITIAL.
      RETURN.
    ENDIF.
    DATA lr_security TYPE tt_security_r.
    lr_security = VALUE #( FOR n IN lt_ncd ( sign = 'I' option = 'EQ' low = n-ranl ) ).
    SORT lr_security BY low.
    DELETE ADJACENT DUPLICATES FROM lr_security COMPARING low.

    SELECT security_id, deal_number, valuation_area, zfs_flow, flowtype, trldate, position_amt, portfolio
      FROM /fs00/cds0002
      WHERE company_code   = @mv_bukrs
        AND product_type   = @c_product-ncd
        AND security_id   IN @lr_security
        AND booking_state <> '4'
      INTO CORRESPONDING FIELDS OF TABLE @lt_flow.

    " The amortisation log only matters for securities with an issue premium (FL36).
    DATA(lr_premium) = VALUE tt_security_r( FOR f IN lt_flow WHERE ( zfs_flow = 'FL36' )
                                            ( sign = 'I' option = 'EQ' low = f-security_id ) ).
    SORT lr_premium BY low.
    DELETE ADJACENT DUPLICATES FROM lr_premium COMPARING low.
    IF lr_premium IS NOT INITIAL.
      read_amort_log( EXPORTING it_security = lr_premium IMPORTING et_amort = lt_amort ev_failed = lv_failed ).
      IF lv_failed = abap_true.
        LOOP AT lt_ncd INTO DATA(ls_failed).
          APPEND VALUE #( sign = 'I' option = 'EQ' low = ls_failed-source ) TO mt_incomplete.
        ENDLOOP.
      ENDIF.
    ENDIF.

    LOOP AT lt_ncd INTO DATA(ls_ncd) GROUP BY ls_ncd-ranl INTO DATA(lv_ranl).
      DATA(lv_issue)     = VALUE ty_amount( ).
      DATA(lv_premium)   = VALUE ty_amount( ).
      DATA(lv_amort002)  = VALUE ty_amount( ).
      DATA(lv_booked)    = VALUE ty_amount( ).
      DATA(lv_redeem)    = VALUE ty_amount( ).
      DATA(lv_redeem_on) = VALUE d( ).
      DATA(lv_portfolio) = VALUE rportb( ).
      DATA(lv_fl04)      = abap_false.
      DATA(lv_fl01)      = abap_false.
      DATA(lv_has_fl36)  = abap_false.

      LOOP AT lt_flow INTO DATA(ls_flow) USING KEY security WHERE security_id = lv_ranl.
        " Issue size: FL04 + FL36 in valuation area 002.
        IF ls_flow-valuation_area = c_area-second AND ( ls_flow-zfs_flow = 'FL04' OR ls_flow-zfs_flow = 'FL36' ).
          lv_issue = lv_issue + ls_flow-position_amt.
        ENDIF.
        IF ls_flow-zfs_flow = 'FL36'.
          lv_has_fl36 = abap_true.
        ENDIF.
        IF ls_flow-valuation_area = c_area-second AND ls_flow-flowtype = 'DBT_A053'.
          lv_premium = lv_premium + ls_flow-position_amt.
        ENDIF.
        " The first FL04 (redemption: amount and bucket date) and FL01 (portfolio) in the report's order.
        IF ls_flow-zfs_flow = 'FL04' AND lv_fl04 = abap_false.
          lv_fl04      = abap_true.
          lv_redeem    = ls_flow-position_amt.
          lv_redeem_on = ls_flow-trldate.
        ENDIF.
        IF ls_flow-zfs_flow = 'FL01' AND lv_fl01 = abap_false.
          lv_fl01      = abap_true.
          lv_portfolio = ls_flow-portfolio.
        ENDIF.
        IF ls_flow-trldate <= mv_month_end.
          IF ls_flow-valuation_area = c_area-second.
            lv_amort002 = lv_amort002 + SWITCH ty_amount( ls_flow-zfs_flow WHEN 'FL51' THEN - ls_flow-position_amt
                                                                           WHEN 'FL52' THEN ls_flow-position_amt ).
          ENDIF.
          " Amortisation booked up to the month end: FL31/FL51 plus and FL52 minus in area 001,
          " FL51 minus and FL52 plus in area 002.
          lv_booked = lv_booked + SWITCH ty_amount( ls_flow-valuation_area
                        WHEN c_area-first THEN SWITCH #( ls_flow-zfs_flow
                                                         WHEN 'FL31' OR 'FL51' THEN ls_flow-position_amt
                                                         WHEN 'FL52' THEN - ls_flow-position_amt )
                        WHEN c_area-second THEN SWITCH #( ls_flow-zfs_flow
                                                          WHEN 'FL51' THEN - ls_flow-position_amt
                                                          WHEN 'FL52' THEN ls_flow-position_amt ) ).
        ENDIF.
      ENDLOOP.

      " Premium still to amortise (form premium_amort), then the redemption less the booked amortisation.
      DATA(lv_outstanding) = VALUE ty_amount( ).
      IF lv_has_fl36 = abap_true.
        DATA(lv_released) = REDUCE ty_amount( INIT r = VALUE ty_amount( ) FOR a IN lt_amort USING KEY ranl
                                              WHERE ( ranl = lv_ranl AND calc_frm <= mv_month_end ) NEXT r = r + a-rev_amt ).
        DATA(lv_logged)   = REDUCE ty_amount( INIT l = VALUE ty_amount( ) FOR a IN lt_amort USING KEY ranl
                                              WHERE ( ranl = lv_ranl AND calc_frm <= mv_month_end
                                                      AND ( update_type = 'SE1200' OR update_type IS INITIAL ) )
                                              NEXT l = l + a-amt ).
        lv_outstanding = lv_premium - ( lv_released - lv_logged - lv_amort002 ).
      ENDIF.
      lv_outstanding = lv_outstanding + lv_redeem - lv_booked.
      DATA(lv_bucket) = bucket_by_days( lv_redeem_on ).

      " Each investor's share: face value x units of the issue size.
      LOOP AT GROUP lv_ranl INTO DATA(ls_holder).
        IF lv_issue <> 0.
          DATA(lv_share) = CONV decfloat34( ls_holder-face_value ) * ls_holder-units / lv_issue.
          add_item( iv_source    = ls_holder-source
                    iv_product   = c_product-ncd
                    iv_portfolio = lv_portfolio
                    iv_bucket    = lv_bucket
                    iv_amount    = CONV #( lv_outstanding * lv_share ) ).
        ENDIF.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

  METHOD read_amort_log.
    FIELD-SYMBOLS <lt_data> TYPE ANY TABLE.

    CLEAR: et_amort, ev_failed.
    " The amortisation log of /FSPL/TRM_R0214, captured as /FS00/ALMR021 does, but with the
    " capture ended by CLEAR_ALL (the report switched the display back on).
    TRY.
        cl_salv_bs_runtime_info=>set( display  = abap_false
                                      metadata = abap_false
                                      data     = abap_true ).
        SUBMIT /fspl/trm_r0214
          WITH p_bukrs  = mv_bukrs
          WITH p_month  = mv_month
          WITH p_year   = mv_year
          WITH so_ranl IN it_security
          EXPORTING LIST TO MEMORY AND RETURN.
        cl_salv_bs_runtime_info=>get_data_ref( IMPORTING r_data = DATA(lr_data) ).
        IF lr_data IS BOUND.
          ASSIGN lr_data->* TO <lt_data>.
          MOVE-CORRESPONDING <lt_data> TO et_amort.
        ENDIF.
      CATCH cx_salv_bs_sc_runtime_info.
        ev_failed = abap_true.
    ENDTRY.
    cl_salv_bs_runtime_info=>clear_all( ).
  ENDMETHOD.

  METHOD read_provisions.
    " Pre-bucketed provisions of the period; without them the report has no provision amounts.
    SELECT zsrc, zbuc1, zbuc2, zbuc3, zbuc4, zbuc5, zbuc6, zbuc7, zbuc8, zbuc9, zbuc10
      FROM /fs00/almtr028
      WHERE zbukrs = @mv_bukrs AND zmonth = @mv_month AND zyear = @mv_year
      INTO TABLE @DATA(lt_provision).
    IF lt_provision IS INITIAL.
      RETURN.
    ENDIF.
    SELECT zgl, zbuc1, zbuc2, zbuc3, zbuc4, zbuc5, zbuc6, zbuc7, zbuc8, zbuc9, zbuc10
      FROM /fs00/almtr027
      WHERE zbukrs = @mv_bukrs AND zmonth = @mv_month AND zyear = @mv_year
      INTO TABLE @DATA(lt_fl_bucket).

    DO c_bucket_count TIMES.
      DATA(lv_bucket) = sy-index.
      DATA(lv_npa)      = VALUE ty_amount( ).
      DATA(lv_standard) = VALUE ty_amount( ).
      LOOP AT lt_provision INTO DATA(ls_provision).
        ASSIGN COMPONENT |ZBUC{ lv_bucket }| OF STRUCTURE ls_provision TO FIELD-SYMBOL(<lv_provision>).
        CASE ls_provision-zsrc.
          WHEN '52' OR '58'.
            lv_npa = lv_npa + <lv_provision>.
          WHEN '51' OR '57'.
            lv_standard = lv_standard + <lv_provision>.
        ENDCASE.
      ENDLOOP.
      LOOP AT lt_fl_bucket INTO DATA(ls_fl_bucket).
        ASSIGN COMPONENT |ZBUC{ lv_bucket }| OF STRUCTURE ls_fl_bucket TO FIELD-SYMBOL(<lv_fl_bucket>).
        CASE ls_fl_bucket-zgl.
          WHEN '0010501020'.
            lv_npa = lv_npa + <lv_fl_bucket>.
          WHEN '0010501022' OR '0010501026' OR '0010501027'.
            lv_standard = lv_standard + <lv_fl_bucket>.
        ENDCASE.
      ENDLOOP.
      " As the report: the netted amounts as absolute values.
      add_item( iv_source = c_source-npa      iv_bucket = lv_bucket iv_amount = abs( lv_npa ) ).
      add_item( iv_source = c_source-standard iv_bucket = lv_bucket iv_amount = abs( lv_standard ) ).
    ENDDO.
  ENDMETHOD.

  METHOD to_range.
    SPLIT iv_list AT ',' INTO TABLE DATA(lt_value).
    LOOP AT lt_value INTO DATA(lv_value).
      CONDENSE lv_value.
      IF lv_value IS NOT INITIAL.
        APPEND VALUE #( sign = 'I' option = 'EQ' low = lv_value ) TO rt_range.
      ENDIF.
    ENDLOOP.
  ENDMETHOD.

  METHOD put.
    ASSIGN COMPONENT |BUCKET{ iv_bucket }| OF STRUCTURE cs_row TO FIELD-SYMBOL(<lv_amount>).
    IF sy-subrc = 0.
      <lv_amount> = <lv_amount> + iv_amount.
    ENDIF.
  ENDMETHOD.

  METHOD get.
    ASSIGN COMPONENT |BUCKET{ iv_bucket }| OF STRUCTURE is_row TO FIELD-SYMBOL(<lv_amount>).
    IF sy-subrc = 0.
      rv_amount = <lv_amount>.
    ENDIF.
  ENDMETHOD.

  METHOD total.
    cs_row-Total = cs_row-Bucket1 + cs_row-Bucket2 + cs_row-Bucket3 + cs_row-Bucket4 + cs_row-Bucket5
                 + cs_row-Bucket6 + cs_row-Bucket7 + cs_row-Bucket8 + cs_row-Bucket9 + cs_row-Bucket10.
  ENDMETHOD.

  METHOD add.
    DO c_bucket_count TIMES.
      put( EXPORTING iv_bucket = sy-index iv_amount = iv_sign * get( iv_bucket = sy-index is_row = is_from )
           CHANGING  cs_row    = cs_to ).
    ENDDO.
    total( CHANGING cs_row = cs_to ).
  ENDMETHOD.

  METHOD level_totals.
    " As the report's LEVEL_TOTALS: 4th level from the 5th, 3rd from the 4th, 1st from the 3rd,
    " in that order; a child flagged negative is subtracted. A parent keeps its own source amounts.
    roll_up( EXPORTING iv_level = 4 CHANGING ct_work = ct_work ).
    roll_up( EXPORTING iv_level = 3 CHANGING ct_work = ct_work ).
    roll_up( EXPORTING iv_level = 1 CHANGING ct_work = ct_work ).
  ENDMETHOD.

  METHOD roll_up.
    " The rows are sorted by group ID, so a parent's children follow it and share its prefix:
    " each parent reads forward only until the prefix changes.
    DATA(lv_prefix) = SWITCH i( iv_level WHEN 4 THEN 12 WHEN 3 THEN 9 ELSE 6 ).
    LOOP AT ct_work ASSIGNING FIELD-SYMBOL(<ls_parent>).
      DATA(lv_parent) = sy-tabix.
      DATA(lv_is_parent) = SWITCH abap_bool( iv_level
        WHEN 4 THEN xsdbool( <ls_parent>-grp3 <> '00' AND <ls_parent>-grp4 <> '00' AND <ls_parent>-grp5 = '00' )
        WHEN 3 THEN xsdbool( <ls_parent>-grp3 <> '00' AND <ls_parent>-grp4 = '00' AND <ls_parent>-grp5 = '00' )
        ELSE        xsdbool( <ls_parent>-grp3 = '00' AND <ls_parent>-grp4 = '00' AND <ls_parent>-grp5 = '00' ) ).
      IF lv_is_parent = abap_false.
        CONTINUE.
      ENDIF.
      LOOP AT ct_work ASSIGNING FIELD-SYMBOL(<ls_child>) FROM lv_parent + 1.
        IF <ls_child>-GroupId(lv_prefix) <> <ls_parent>-GroupId(lv_prefix).
          EXIT.
        ENDIF.
        DATA(lv_is_child) = SWITCH abap_bool( iv_level
          WHEN 4 THEN xsdbool( <ls_child>-GroupId+12(2) <> '00' )
          WHEN 3 THEN xsdbool( <ls_child>-GroupId+9(5) <> '00:00' AND <ls_child>-grp5 = '00' )
          ELSE        xsdbool( <ls_child>-GroupId+6(8) <> '00:00:00' AND <ls_child>-grp5 = '00' AND <ls_child>-grp4 = '00' ) ).
        IF lv_is_child = abap_true.
          add( EXPORTING is_from = <ls_child> iv_sign = COND #( WHEN <ls_child>-Negative = abap_true THEN -1 ELSE 1 )
               CHANGING  cs_to   = <ls_parent> ).
        ENDIF.
      ENDLOOP.
      total( CHANGING cs_row = <ls_parent> ).
    ENDLOOP.
  ENDMETHOD.

  METHOD sub_totals.
    " xx:99:99:99:99 = sum of the xx:yy:00:00:00 rows of SA (outflows) and SB (inflows).
    LOOP AT ct_work ASSIGNING FIELD-SYMBOL(<ls_sub>) WHERE RowStyle = 'SUBTOTAL'.
      DATA(ls_sum) = VALUE ty_work( ).
      LOOP AT ct_work INTO DATA(ls_row) WHERE GroupId(2) = <ls_sub>-GroupId(2) AND GroupId+6(8) = '00:00:00'.
        add( EXPORTING is_from = ls_row CHANGING cs_to = ls_sum ).
      ENDLOOP.
      DO c_bucket_count TIMES.
        ASSIGN COMPONENT |BUCKET{ sy-index }| OF STRUCTURE <ls_sub> TO FIELD-SYMBOL(<lv_sub>).
        <lv_sub> = get( iv_bucket = sy-index is_row = ls_sum ).
      ENDDO.
      total( CHANGING cs_row = <ls_sub> ).
    ENDLOOP.
  ENDMETHOD.

  METHOD computed_rows.
    DATA(ls_out) = VALUE #( ct_work[ GroupId = c_row-outflow ] OPTIONAL ).
    DATA(ls_in)  = VALUE #( ct_work[ GroupId = c_row-inflow ] OPTIONAL ).
    IF ls_out-GroupId IS INITIAL OR ls_in-GroupId IS INITIAL.
      RETURN.
    ENDIF.

    " A1: cumulative outflows; its total is the cumulative value at the end of bucket 10.
    DATA(ls_cum_out) = VALUE ty_work( GroupId = c_row-cum_outflow GroupName = 'Cumulative Outflows'
                                      XbrlCode = 'Y1260' RowStyle = 'CUMULATIVE' ) ##NO_TEXT.
    " SC: mismatch = inflows - outflows.
    DATA(ls_mismatch) = VALUE ty_work( GroupId = c_row-mismatch GroupName = 'SC = Mismatch (SB-SA)'
                                       XbrlCode = 'Y1820' RowStyle = 'MISMATCH' ) ##NO_TEXT.
    " SD: cumulative mismatch; its total is the cumulative value at the end of bucket 10.
    DATA(ls_cum_mismatch) = VALUE ty_work( GroupId = c_row-cum_mismatch GroupName = 'SD = Cumulative Mismatch'
                                           XbrlCode = 'Y1830' RowStyle = 'CUMULATIVE' ) ##NO_TEXT.
    " SE: mismatch as a percentage of the outflows; SF: cumulative mismatch as a percentage of the
    " cumulative outflows; 0 where the base is not positive.
    DATA(ls_pct) = VALUE ty_work( GroupId = c_row-pct GroupName = 'Mismatch as percentage of Total Outflows'
                                  XbrlCode = 'Y1840' RowStyle = 'PERCENT' ) ##NO_TEXT.
    DATA(ls_cum_pct) = VALUE ty_work( GroupId = c_row-cum_pct
                                      GroupName = 'Cumulative Mismatch as percentage of Cumulative Total Outflows'
                                      XbrlCode = 'Y1850' RowStyle = 'PERCENT' ) ##NO_TEXT.

    DATA lv_cum_out      TYPE ty_amount.
    DATA lv_cum_mismatch TYPE ty_amount.
    DO c_bucket_count TIMES.
      DATA(lv_out)      = get( iv_bucket = sy-index is_row = ls_out ).
      DATA(lv_mismatch) = CONV ty_amount( get( iv_bucket = sy-index is_row = ls_in ) - lv_out ).
      lv_cum_out      = lv_cum_out + lv_out.
      lv_cum_mismatch = lv_cum_mismatch + lv_mismatch.
      put( EXPORTING iv_bucket = sy-index iv_amount = lv_cum_out      CHANGING cs_row = ls_cum_out ).
      put( EXPORTING iv_bucket = sy-index iv_amount = lv_mismatch     CHANGING cs_row = ls_mismatch ).
      put( EXPORTING iv_bucket = sy-index iv_amount = lv_cum_mismatch CHANGING cs_row = ls_cum_mismatch ).
      IF lv_out > 0.
        put( EXPORTING iv_bucket = sy-index iv_amount = CONV #( lv_mismatch / lv_out * 100 ) CHANGING cs_row = ls_pct ).
      ENDIF.
      IF lv_cum_out > 0.
        put( EXPORTING iv_bucket = sy-index iv_amount = CONV #( lv_cum_mismatch / lv_cum_out * 100 ) CHANGING cs_row = ls_cum_pct ).
      ENDIF.
    ENDDO.
    ls_cum_out-Total      = lv_cum_out.
    total( CHANGING cs_row = ls_mismatch ).
    ls_cum_mismatch-Total = lv_cum_mismatch.
    " As the report: (SB - SA) / SA rounded to four places, as a percentage; SF has no total.
    IF ls_out-Total > 0.
      ls_pct-Total = round( val = ( ls_in-Total - ls_out-Total ) / ls_out-Total dec = 4 ) * 100.
    ENDIF.

    APPEND: ls_cum_out TO ct_work, ls_mismatch TO ct_work, ls_cum_mismatch TO ct_work, ls_pct TO ct_work, ls_cum_pct TO ct_work.
  ENDMETHOD.

  METHOD get_period.
    DATA(lv_last) = zcl_fs_alm_qtrrpt_query=>last_day( iv_year = iv_year iv_month = iv_month ).
    rs_period = VALUE #( CompanyCode = iv_bukrs FiscalYear = iv_year FiscalPeriod = iv_month KeyDate = lv_last + 1 ).

    SELECT zcreated_by, zcreated_date FROM /fs00/almtr015
      WHERE zbukrs = @iv_bukrs AND zmonth = @iv_month AND zyear = @iv_year
      ORDER BY zcreated_date, zcreated_time
      INTO TABLE @DATA(lt_saved).
    IF lt_saved IS NOT INITIAL.
      rs_period-Saved     = abap_true.
      rs_period-SavedRows = lines( lt_saved ).
      rs_period-SavedBy   = lt_saved[ 1 ]-zcreated_by.
      rs_period-SavedOn   = lt_saved[ 1 ]-zcreated_date.
    ENDIF.

    " The ALM 2 period lock (/FS00/ALMDM0006 value 02).
    SELECT SINGLE zcreated_by, zcreated_date FROM /fs00/almtr012
      WHERE zbukrs = @iv_bukrs AND zsource = '02' AND zdate = @lv_last AND zlock = 'X'
      INTO @DATA(ls_lock).
    IF sy-subrc = 0.
      rs_period-Locked   = abap_true.
      rs_period-LockedBy = ls_lock-zcreated_by.
      rs_period-LockedOn = ls_lock-zcreated_date.
    ENDIF.
  ENDMETHOD.

  METHOD apply_filter.
    LOOP AT it_filter INTO DATA(ls_filter).
      LOOP AT ct_report ASSIGNING FIELD-SYMBOL(<ls_row>).
        ASSIGN COMPONENT ls_filter-name OF STRUCTURE <ls_row> TO FIELD-SYMBOL(<lv_value>).
        IF sy-subrc = 0 AND <lv_value> NOT IN ls_filter-range.
          DELETE ct_report.
        ENDIF.
      ENDLOOP.
    ENDLOOP.
  ENDMETHOD.

ENDCLASS.
