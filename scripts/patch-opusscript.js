const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '..', 'node_modules', 'opusscript', 'index.js');

if (fs.existsSync(targetPath)) {
  let code = fs.readFileSync(targetPath, 'utf8');
  let modified = false;

  if (code.includes('this.inPCM = opusscript_native.HEAPU16.subarray(this.inPCMPointer, this.inPCMPointer + this.inPCMLength);')) {
    code = code.replace(
      'this.inPCM = opusscript_native.HEAPU16.subarray(this.inPCMPointer, this.inPCMPointer + this.inPCMLength);',
      'this.inPCM = opusscript_native.HEAPU16.subarray(this.inPCMPointer >> 1, (this.inPCMPointer + this.inPCMLength) >> 1);'
    );
    modified = true;
  }

  if (code.includes('this.outPCM = opusscript_native.HEAPU16.subarray(this.outPCMPointer, this.outPCMPointer + this.outPCMLength);')) {
    code = code.replace(
      'this.outPCM = opusscript_native.HEAPU16.subarray(this.outPCMPointer, this.outPCMPointer + this.outPCMLength);',
      'this.outPCM = opusscript_native.HEAPU16.subarray(this.outPCMPointer >> 1, (this.outPCMPointer + this.outPCMLength) >> 1);'
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(targetPath, code, 'utf8');
    console.log('[patch-opusscript] Successfully patched opusscript byte offset bug!');
  } else {
    console.log('[patch-opusscript] opusscript is already patched.');
  }
}
