*&---------------------------------------------------------------------*
*& Include /FS00/ALMR008_TOP                        - Report /FS00/ALMR008
*&---------------------------------------------------------------------*
REPORT /fs00/almr008.

TYPES : BEGIN OF ty_data,
          color    TYPE c LENGTH 4,
          b01      TYPE tb_limit_amount,
          b02      TYPE tb_limit_amount,
          b03      TYPE tb_limit_amount,
          b04      TYPE tb_limit_amount,
          b05      TYPE tb_limit_amount,
          b06      TYPE tb_limit_amount,
          b07      TYPE tb_limit_amount,
          b08      TYPE tb_limit_amount,
          b09      TYPE tb_limit_amount,
          b10      TYPE tb_limit_amount,
          b11      TYPE tb_limit_amount,
          tot      TYPE tb_limit_amount,
          cb01     TYPE /fs00/almdt0058,
          cb02     TYPE /fs00/almdt0058,
          cb03     TYPE /fs00/almdt0058,
          cb04     TYPE /fs00/almdt0058,
          cb05     TYPE /fs00/almdt0058,
          cb06     TYPE /fs00/almdt0058,
          cb07     TYPE /fs00/almdt0058,
          cb08     TYPE /fs00/almdt0058,
          cb09     TYPE /fs00/almdt0058,
          cb10     TYPE /fs00/almdt0058,
          cb11     TYPE /fs00/almdt0058,
          ctot     TYPE c LENGTH 20,
          colortab TYPE lvc_t_scol,
          celltab  TYPE lvc_t_styl..
          INCLUDE TYPE /fs00/almtr003.
TYPES : END OF ty_data.

DATA : gt_data TYPE TABLE OF ty_data,
       gs_data TYPE ty_data.

FIELD-SYMBOLS:<fs_data> TYPE ty_data.

DATA: gv_sdate TYPE dats,
      gv_edate TYPE dats,
      gv_date  TYPE dats.

DATA: rt_date TYPE RANGE OF dats,
      rt_ttyp TYPE RANGE OF tb_sfhaart,
      rt_prd  TYPE RANGE OF vvsart.

DATA: gt_buck TYPE /fs00/almtt001.

DATA: gt_fcat    TYPE  lvc_t_fcat,
      gs_fcat    TYPE lvc_s_fcat,
      gs_variant TYPE disvariant,
      gs_layout  TYPE lvc_s_layo.

DATA : gt_dat TYPE REF TO data,
       gv_div TYPE tb_limit_amount,
       gv_ans TYPE c.

FIELD-SYMBOLS: <fs_dat>  TYPE ANY TABLE,
               <fs_pinv> TYPE ANY TABLE.

" Data
DATA: gs_celltab TYPE lvc_s_styl,
      gt_celltab TYPE lvc_t_styl..

" Constants
CONSTANTS: gc_style_bold            TYPE int4 VALUE '00000121'.

" Data
DATA : gt_color TYPE STANDARD TABLE OF lvc_s_scol.

"" TRM Data Int
TYPES: BEGIN OF ty_int,
         color TYPE c LENGTH 4,
         stype TYPE c LENGTH 2,
         sdesc TYPE c LENGTH 100,
         date  TYPE dats,
         buck  TYPE c LENGTH 2,
         b01   TYPE tb_limit_amount,
         b02   TYPE tb_limit_amount,
         b03   TYPE tb_limit_amount,
         b04   TYPE tb_limit_amount,
         b05   TYPE tb_limit_amount,
         b06   TYPE tb_limit_amount,
         b07   TYPE tb_limit_amount,
         b08   TYPE tb_limit_amount,
         b09   TYPE tb_limit_amount,
         b10   TYPE tb_limit_amount,
         tot   TYPE tb_limit_amount.
         INCLUDE TYPE /fs00/cds0001.
TYPES: END OF ty_int.

DATA: gt_int TYPE TABLE OF ty_int,
      gs_int TYPE ty_int.

""  TRM Data Pri
TYPES: BEGIN OF ty_os,
         color TYPE c LENGTH 4,
         stype TYPE c LENGTH 2,
         sdesc TYPE c LENGTH 100,
         date  TYPE dats,
         rate  TYPE pkond,
         buck  TYPE c LENGTH 2,
         fvar  TYPE c LENGTH 20,
         amt   TYPE tb_limit_amount,
         b01   TYPE tb_limit_amount,
         b02   TYPE tb_limit_amount,
         b03   TYPE tb_limit_amount,
         b04   TYPE tb_limit_amount,
         b05   TYPE tb_limit_amount,
         b06   TYPE tb_limit_amount,
         b07   TYPE tb_limit_amount,
         b08   TYPE tb_limit_amount,
         b09   TYPE tb_limit_amount,
         b10   TYPE tb_limit_amount,
         tot   TYPE tb_limit_amount.
         INCLUDE TYPE /fs00/cds0001.
TYPES: END OF ty_os.

DATA: gt_os TYPE TABLE OF ty_os,
      gs_os TYPE ty_os.

"" TB Data
TYPES: BEGIN OF ty_tb,
         bukrs      TYPE bukrs,
         chrt_acc   TYPE ktopl,
         bal        TYPE /bcv/fnd_currency,
         ab_bal     TYPE /bcv/fnd_currency,
         bs_acc     TYPE text60,
         gl_acc     TYPE saknr,
         short_text TYPE char60,
         long_text  TYPE char60,
         alm_map    TYPE char10,
         cal_typ    TYPE /fs00/almdt0052,
         cal_desc   TYPE char120,
         gr_id      TYPE /fs00/almdt0033,
         gr_desc    TYPE char120,
         bu_id      TYPE char2,
         bu_desc    TYPE char120,
         gr_id2     TYPE /fs00/almdt0033,
         gr_desc2   TYPE char120,
         xbilk      TYPE xbilk,
         type       TYPE char4,
         color      TYPE lvc_t_scol,
       END OF ty_tb.

DATA: gt_tb TYPE TABLE OF ty_tb,
      gs_tb TYPE ty_tb.

TYPES : BEGIN OF ty_ben,
          gsart                   TYPE vvsart,
          product_type_desc       TYPE text30,
          ranl                    TYPE vvranlw,
          ranl_ln                 TYPE xallb,
          isin                    TYPE vvranlwx,
          units                   TYPE tpm_units,
          investor                TYPE tb_kunnr_new,
          name_org1               TYPE bu_nameor1,
          grp_key                 TYPE bp_grp,
          segment                 TYPE char3,
          alm_segment             TYPE char20,
          os_amt_total            TYPE tpm_amount,
          os_amt                  TYPE tpm_amount,
          bkt_dt                  TYPE dats,
          bkt_no                  TYPE char2,
          days                    TYPE i,
          recdate                 TYPE dats,
          source                  TYPE /fs00/almdt0004,
          src_desc                TYPE /fs00/almdt0005,
          face_value              TYPE tpm_amount,
          share                   TYPE tpm_amount,
          total_issue_size        TYPE tpm_amount,
          os_perc                 TYPE pkond,
          premium_to_be_amortized TYPE tpm_amount,
          amort002                TYPE tpm_amount,
          amort_issue             TYPE tpm_amount,
          portfolio               TYPE rportb,
        END OF ty_ben.

DATA: gt_cp  TYPE TABLE OF ty_ben,
      gt_ncd TYPE TABLE OF ty_ben,
      gs_ben TYPE ty_ben.

DATA: gt_prov TYPE TABLE OF /fs00/almtr028.

SELECTION-SCREEN BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
  PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY.
  PARAMETERS: p_mon TYPE n LENGTH 2 OBLIGATORY.
  PARAMETERS: p_year TYPE n LENGTH 4 OBLIGATORY.
SELECTION-SCREEN END OF BLOCK b1.

SELECTION-SCREEN : BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
  PARAMETERS: rb1 RADIOBUTTON GROUP a,
              rb2 RADIOBUTTON GROUP a,
              rb3 RADIOBUTTON GROUP a,
              rb4 RADIOBUTTON GROUP a  DEFAULT 'X'.
SELECTION-SCREEN : END OF BLOCK b2.

SELECTION-SCREEN : BEGIN OF BLOCK b3 WITH FRAME TITLE TEXT-003.
  PARAMETERS: p_check AS CHECKBOX.
  PARAMETERS: p_isplit AS CHECKBOX.
SELECTION-SCREEN : END OF BLOCK b3.

SELECTION-SCREEN BEGIN OF BLOCK b4 WITH FRAME TITLE TEXT-004.
  PARAMETERS   p_layout TYPE slis_vari.
SELECTION-SCREEN END OF BLOCK b4.
