*&---------------------------------------------------------------------*
*& Include /FS00/ALMR003_TOP                        - Report /FS00/ALMR003
*&---------------------------------------------------------------------*
REPORT /fs00/almr003 MESSAGE-ID /fs00/msg.


TYPES: BEGIN OF ty_data,
         color TYPE c LENGTH 4,
         stype TYPE c LENGTH 2,
         sdesc TYPE c LENGTH 100,
         date  TYPE dats,
         b01   TYPE tb_limit_amount,
         b02   TYPE tb_limit_amount,
         b03   TYPE tb_limit_amount,
         b04   TYPE tb_limit_amount,
         b05   TYPE tb_limit_amount,
         tot   TYPE tb_limit_amount.
         INCLUDE TYPE /fs00/cds0001.
TYPES: END OF ty_data.

DATA: gt_data TYPE TABLE OF ty_data,
      gs_data TYPE ty_data.

TYPES: BEGIN OF ty_cf,
         os_guid          TYPE 	tpm_db_os_guid,
         bustranscat      TYPE 	tpm_bustranscat,
         trldate          TYPE 	tpm_trldate,
         bustransid       TYPE   tpm_bustransid,
         booking_state    TYPE 	tpm_trl_bookingstate,
         flowtype         TYPE   tpm_dis_flowtype,
         dis_flowtypetext TYPE   tpm_dft_text,
         zfs_flow         TYPE   zdt_flow_cat,
         units            TYPE 	tpm_units_l,
         nominal_amt      TYPE 	tpm_nominal_amt,
         nominal_curr     TYPE   tpm_nominal_curr,
         position_amt     TYPE   tpm_position_amt,
         position_curr    TYPE 	tpm_position_curr,
         valuation_amt    TYPE 	tpm_valuation_amt,
         valuation_curr   TYPE   tpm_valuation_curr,
         valuation_area   TYPE   tpm_val_area,
         valuation_class  TYPE 	tpm_val_class,
         company_code     TYPE   bukrs,
         product_type     TYPE   vvsart,
         security_id      TYPE 	vvranlw,
         lot_id           TYPE   tpm_lot_id,
         deal_number      TYPE 	tb_rfha,
         zs_type          TYPE /fs00/almdt0007,
         zs_desc          TYPE /fs00/almdt0005,
       END OF ty_cf.

DATA: gt_cf TYPE TABLE OF ty_cf,
      gs_cf TYPE ty_cf.

DATA:gt_fcat    TYPE  lvc_t_fcat,
     gs_fcat    TYPE lvc_s_fcat,
     gs_variant TYPE disvariant,
     gs_layout  TYPE lvc_s_layo.

TYPES: rt_int TYPE RANGE OF /fs00/almdt0007,
       rt_pri TYPE RANGE OF /fs00/almdt0007.

DATA: gt_int TYPE rt_int,
      gt_pri TYPE rt_int.

DATA: gt_buck TYPE /fs00/almtt001.

DATA: gv_rfha TYPE tb_rfha,
      gv_prd  TYPE vvsart,
      gv_div  TYPE tb_limit_amount.

"Selection - Screen
SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
  PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY.
  PARAMETERS: p_mon TYPE c LENGTH 2 OBLIGATORY.
  PARAMETERS: p_year TYPE  c LENGTH 4 OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
  SELECT-OPTIONS: s_rfha FOR gv_rfha.
  SELECT-OPTIONS: s_prd FOR gv_prd.
SELECTION-SCREEN END OF BLOCK b2.

SELECTION-SCREEN : BEGIN OF BLOCK b4 WITH FRAME TITLE TEXT-003."--Value Conversion
  PARAMETERS : rb1 RADIOBUTTON GROUP rbg2 ,               "--value in cr
               rb2 RADIOBUTTON GROUP rbg2,                "--value in lakhs
               rb3 RADIOBUTTON GROUP rbg2,                "--value in thousands
               rb4 RADIOBUTTON GROUP rbg2 DEFAULT 'X'.    "--value in inr
SELECTION-SCREEN : END OF BLOCK b4.

SELECTION-SCREEN BEGIN OF BLOCK b3 WITH FRAME TITLE TEXT-004.
  PARAMETERS p_layout TYPE slis_vari.
SELECTION-SCREEN END OF BLOCK b3.