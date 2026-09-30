*&---------------------------------------------------------------------*
*& Include ZFS_R_XA_TBL2JSON_TOP
*&---------------------------------------------------------------------*
*& Declarations and selection screen.
*&---------------------------------------------------------------------*
REPORT zfs_r_xa_tbl2json LINE-SIZE 255.

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