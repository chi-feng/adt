"use strict";

// Computes the discrete Fourier transform (DFT) of the given complex vector.
// All the array arguments must be non-null and have the same length.
// Computes in place.
function transform(real, imag) {
    const n = real.length;
    if (n !== imag.length)
        throw new RangeError("Mismatched lengths");
    if (n === 0)
        return;
    else if ((n & (n - 1)) === 0)  // Is power of 2
        transformRadix2(real, imag);
    else  // More complicated algorithm for arbitrary sizes
        throw new RangeError("Input size must be a power of 2 for this simple FFT.");

}

// Cooley-Tukey FFT algorithm, radix-2, decimation-in-time.
function transformRadix2(real, imag) {
    const n = real.length;
    if (n !== imag.length) throw new RangeError("Mismatched lengths");
    if (n === 0) return;
    if ((n & (n - 1)) !== 0) throw new RangeError("Length must be a power of 2");

    // Precompute tables for twiddle factors
    const cosTable = new Array(n / 2);
    const sinTable = new Array(n / 2);
    for (let k = 0; k < n / 2; k++) {
        const angle = 2 * Math.PI * k / n;
        cosTable[k] = Math.cos(angle);
        sinTable[k] = Math.sin(angle);
    }

    // Bit-reversed permutation
    let levels = Math.log2(n);
    for (let i = 0; i < n; i++) {
        let j = 0;
        for (let k = 0; k < levels; k++) {
            j = (j << 1) | ((i >> k) & 1);
        }
        if (j > i) {
            [real[i], real[j]] = [real[j], real[i]];
            [imag[i], imag[j]] = [imag[j], imag[i]];
        }
    }

    // Cooley-Tukey butterfly stages
    for (let size = 2; size <= n; size *= 2) {
        let halfsize = size / 2;
        let tablestep = n / size;
        for (let i = 0; i < n; i += size) {
            for (let j = i, k = 0; j < i + halfsize; j++, k += tablestep) {
                // Use precomputed tables instead of Math.cos/sin
                const cos_k = cosTable[k];
                const sin_k = sinTable[k];
                let tpre =  real[j+halfsize] * cos_k + imag[j+halfsize] * sin_k;
                let tpim = -real[j+halfsize] * sin_k + imag[j+halfsize] * cos_k;
                real[j + halfsize] = real[j] - tpre;
                imag[j + halfsize] = imag[j] - tpim;
                real[j] += tpre;
                imag[j] += tpim;
            }
        }
    }
}