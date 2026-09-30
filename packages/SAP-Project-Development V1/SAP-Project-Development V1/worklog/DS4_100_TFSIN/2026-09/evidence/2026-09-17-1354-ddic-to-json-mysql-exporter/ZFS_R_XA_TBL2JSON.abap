*&---------------------------------------------------------------------*
*& Report ZFS_R_XA_TBL2JSON
*&---------------------------------------------------------------------*
*& Exports the DDIC definition of one or more tables as JSON, so that a
*& converter outside SAP can generate a MySQL CREATE TABLE from it.
*&
*& Every field is reported twice: the raw SAP facts (data type, length,
*& decimals) and a suggested MySQL column type. The consumer can trust the
*& suggestion or re-derive its own from the raw facts.
*&
*& All of the work belongs to ZCL_FS_XA_TBL2JSON. This report is only the
*& selection screen, the display and the download.
*&---------------------------------------------------------------------*
INCLUDE zfs_r_xa_tbl2json_top.
INCLUDE zfs_r_xa_tbl2json_f01.

AT SELECTION-SCREEN ON VALUE-REQUEST FOR p_file.
  lcl_app=>pick_file( ).

START-OF-SELECTION.
  lcl_app=>run( ).