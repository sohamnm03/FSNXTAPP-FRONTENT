*&---------------------------------------------------------------------*
*& Include          /FS00/ALMR009_TOP
*&---------------------------------------------------------------------*
REPORT /fs00/almr009.

TYPES: BEGIN OF ty_data,
         bukrs        TYPE bukrs,
         chrt_acc     TYPE ktopl,
         bs_acc       TYPE char60,
         gl_acc       TYPE saknr,
         short_text   TYPE char100,
         long_text    TYPE char100,
         created_date TYPE dats,
         created_by   TYPE char60,
         alm_map      TYPE char10,
         b1_pos_blck  TYPE char10,
         a1_pos_blck  TYPE char10,
         a1_cre_blck  TYPE char10,
         a1_del_flag  TYPE char10,
         xbilk        TYPE xbilk,
         xspeb        TYPE xspeb,
         skb1_xspeb   TYPE xspeb,
         ska1_xspeb   TYPE xspeb,
         xspea        TYPE xspea,
         xloev        TYPE xloev,
       END OF ty_data.
DATA: gt_ska1 TYPE TABLE OF ska1,
      gs_ska1 LIKE LINE OF gt_ska1,
      gt_skb1 TYPE TABLE OF skb1,
      gs_skb1 LIKE LINE OF gt_skb1,
      gt_skat TYPE TABLE OF skat,
      gs_skat LIKE LINE OF gt_skat,
      gt_data TYPE TABLE OF ty_data,
      gs_data LIKE LINE OF gt_data.

DATA : gt_fcat    TYPE lvc_t_fcat,
       gt_header  TYPE slis_t_listheader,
*       gt_sort    TYPE lvc_t_sort,
       gs_layout  TYPE lvc_s_layo,
       gs_variant TYPE disvariant.

CONSTANTS: c_yes TYPE char3 VALUE 'Yes',
           c_no  TYPE char3 VALUE 'No'.

SELECTION-SCREEN: BEGIN OF BLOCK b1 WITH FRAME TITLE TEXT-001.
  PARAMETERS: p_chart TYPE ktopl OBLIGATORY,
              p_bukrs TYPE bukrs OBLIGATORY.
SELECTION-SCREEN : END OF BLOCK b1.

SELECTION-SCREEN : BEGIN OF BLOCK b2 WITH FRAME TITLE TEXT-002.
  SELECT-OPTIONS: so_date FOR sy-datum.
  PARAMETERS : p_bs AS CHECKBOX DEFAULT ' '.
SELECTION-SCREEN : END OF BLOCK b2.

SELECTION-SCREEN BEGIN OF BLOCK b3 WITH FRAME TITLE TEXT-003.
  PARAMETERS p_layout TYPE slis_vari.
SELECTION-SCREEN END OF BLOCK b3.
