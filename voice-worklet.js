/* Cubage SBF — capture micro (AudioWorklet) : regroupe les échantillons par blocs de 4096 et les envoie
   au fil principal, qui les transmet au moteur de reconnaissance. Ne produit aucun son en sortie. */
class SbfCapture extends AudioWorkletProcessor{
  constructor(){super();this.buf=new Float32Array(4096);this.n=0;}
  process(inputs){const ch=inputs[0]&&inputs[0][0];if(!ch)return true;let i=0;
    while(i<ch.length){const k=Math.min(ch.length-i,this.buf.length-this.n);this.buf.set(ch.subarray(i,i+k),this.n);this.n+=k;i+=k;
      if(this.n===this.buf.length){this.port.postMessage(this.buf,[this.buf.buffer]);this.buf=new Float32Array(4096);this.n=0;}}
    return true;}
}
registerProcessor('sbf-capture',SbfCapture);
