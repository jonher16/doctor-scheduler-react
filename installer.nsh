!macro customInstall
  ; No need to check for Python since we're using a bundled executable
  DetailPrint "Setting up Hospital Scheduler..."
  
  ; Create desktop shortcut (redundant with default behavior but included for completeness)
  CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_NAME}.exe"
  
  ; Create start menu shortcut (redundant with default behavior but included for completeness)
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_NAME}.exe"
!macroend