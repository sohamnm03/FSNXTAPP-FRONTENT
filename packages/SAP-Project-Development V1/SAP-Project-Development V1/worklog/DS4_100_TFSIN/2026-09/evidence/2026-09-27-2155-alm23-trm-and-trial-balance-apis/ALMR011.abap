*&---------------------------------------------------------------------*
*& Report /FS00/ALMR011
*&---------------------------------------------------------------------*
*&
*&---------------------------------------------------------------------*


INCLUDE /fs00/almr011_top.
INCLUDE /fs00/almr011_f01.

AT SELECTION-SCREEN ON p_layout.
  IF p_layout IS NOT INITIAL.
    gs_variant-variant = p_layout.
  ENDIF.

AT SELECTION-SCREEN ON VALUE-REQUEST FOR p_layout.
  PERFORM sub_get_layout.

AT SELECTION-SCREEN ON VALUE-REQUEST FOR p_file.

  CALL FUNCTION 'F4_FILENAME'
*   EXPORTING
*     PROGRAM_NAME        = SYST-CPROG
*     DYNPRO_NUMBER       = SYST-DYNNR
*     FIELD_NAME          = ' '
    IMPORTING
      file_name = p_file.

START-OF-SELECTION.
  PERFORM get_data.
  PERFORM process_data.
