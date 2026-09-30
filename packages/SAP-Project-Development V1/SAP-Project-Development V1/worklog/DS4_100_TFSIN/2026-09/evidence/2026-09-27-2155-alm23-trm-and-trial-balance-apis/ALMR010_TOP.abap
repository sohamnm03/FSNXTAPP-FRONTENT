*&---------------------------------------------------------------------*
*& Include          /FS00/ALMR010_TOP
*&---------------------------------------------------------------------*
REPORT /fs00/almr010.

TABLES: /fs00/almtr022.

TYPES: BEGIN OF ty_data,
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
*        bu_id2    TYPE char2,
*        bu_desc2  TYPE char120,
         type       TYPE char4,
         color      TYPE lvc_t_scol,
       END OF ty_data.

DATA: gt_data  TYPE TABLE OF ty_data,
      gs_data  LIKE LINE OF gt_data,
      gt_skb1  TYPE TABLE OF skb1,
      gs_skb1  LIKE LINE OF gt_skb1,
      gt_ska1  TYPE TABLE OF ska1,
      gs_ska1  LIKE LINE OF gt_ska1,
      gt_tr018 TYPE TABLE OF /fs00/almtr018,
      gs_tr018 LIKE LINE OF gt_tr018,
      gt_skat  TYPE TABLE OF skat,
      gs_skat  LIKE LINE OF gt_skat.

DATA: gt_gl TYPE TABLE OF fagl_s_rfssld00_list.
FIELD-SYMBOLS: <fs_dat>  TYPE ANY TABLE.

DATA : gt_gld TYPE REF TO data.

DATA : gt_fcat    TYPE lvc_t_fcat,
       gs_layout  TYPE lvc_s_layo,
       gv_div     TYPE tb_limit_amount,
       gs_variant TYPE disvariant,
       gt_header  TYPE slis_t_listheader.

CONSTANTS: c_yes TYPE char3 VALUE 'YES',
           c_no  TYPE char3 VALUE 'NO'.

SELECTION-SCREEN: BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-001.
  PARAMETERS: p_bukrs TYPE bukrs OBLIGATORY,
              p_month TYPE n LENGTH 2 OBLIGATORY,
              p_year  TYPE n LENGTH 4 OBLIGATORY.
SELECTION-SCREEN: END OF BLOCK b2.

SELECTION-SCREEN: BEGIN OF BLOCK b3 WITH FRAME TITLE TEXT-004.
  PARAMETERS: p_grp  TYPE /fs00/almdt0001,
              p_grp2 TYPE /fs00/almdt0001.
SELECTION-SCREEN: END OF BLOCK b3.

SELECTION-SCREEN BEGIN OF BLOCK b4 WITH FRAME TITLE TEXT-006.
  SELECT-OPTIONS: s_cal FOR /fs00/almtr022-zcal_id MATCHCODE OBJECT /fs00/almsh001.
SELECTION-SCREEN END OF BLOCK b4.

SELECTION-SCREEN BEGIN OF BLOCK b7 WITH FRAME TITLE TEXT-007.
  PARAMETERS : p_bs    AS CHECKBOX,
               p_check AS CHECKBOX,
               p_as    AS CHECKBOX.
SELECTION-SCREEN END OF BLOCK b7.

SELECTION-SCREEN : BEGIN OF BLOCK b6 WITH FRAME TITLE TEXT-010."--Value Conversion
  PARAMETERS : rb1 RADIOBUTTON GROUP rbg2 ,               "--value in cr
               rb2 RADIOBUTTON GROUP rbg2,                "--value in lakhs
               rb3 RADIOBUTTON GROUP rbg2,                "--value in thousands
               rb4 RADIOBUTTON GROUP rbg2 DEFAULT 'X'.    "--value in inr
SELECTION-SCREEN : END OF BLOCK b6.

SELECTION-SCREEN BEGIN OF BLOCK b5 WITH FRAME TITLE TEXT-005.
  PARAMETERS: p_layout TYPE slis_vari.
SELECTION-SCREEN END OF BLOCK b5.
