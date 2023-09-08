// If the user is not including numeric.js already, add shim so numeric library works. Removes dependency on numeric.js

const numeric = {
  dim(x) {
    let y, z;
    if (typeof x === "object") {
      y = x[0];
      if (typeof y === "object") {
        z = y[0];
        if (typeof z === "object") {
          return numeric._dim(x);
        }
        return [x.length, y.length];
      }
      return [x.length];
    }
    return [];
  },

  _foreach2: (function _foreach2(x, s, k, f) {
    if (k === s.length - 1) {
      return f(x);
    }
    let i;
    const n = s[k], ret = Array(n);
    for (i = n - 1; i >= 0; i--) {
      ret[i] = _foreach2(x[i], s, k + 1, f);
    }
    return ret;
  }),

  _dim(x) {
    const ret = [];
    while (typeof x === "object") {
      ret.push(x.length)
      x = x[0];
    }
    return ret;
  },

  cloneV(x) {
    const _n = x.length;
    let i;
    const ret = Array(_n);

    for (i = _n - 1; i !== -1; --i) {
      ret[i] = (x[i]);
    }
    return ret;
  },

  clone(x) {
    if (typeof x !== "object")
      return (x);

    return numeric._foreach2(x, numeric.dim(x), 0, numeric.cloneV);
  },

  diag(d) {
    let i, i1, j;
    const n = d.length, A = Array(n);
    let Ai;
    for (i = n - 1; i >= 0; i--) {
      Ai = Array(n);
      i1 = i + 2;
      for (j = n - 1; j >= i1; j -= 2) {
        Ai[j] = 0;
        Ai[j - 1] = 0;
      }
      if (j > i) {
        Ai[j] = 0;
      }
      Ai[i] = d[i];
      for (j = i - 1; j >= 1; j -= 2) {
        Ai[j] = 0;
        Ai[j - 1] = 0;
      }
      if (j === 0) {
        Ai[0] = 0;
      }
      A[i] = Ai;
    }
    return A;
  },

  rep(s, v, k) {
    if (typeof k === "undefined") {
      k = 0;
    }
    const n = s[k], ret = Array(n);
    let i;
    if (k === s.length - 1) {
      for (i = n - 2; i >= 0; i -= 2) {
        ret[i + 1] = v;
        ret[i] = v;
      }
      if (i === -1) {
        ret[0] = v;
      }
      return ret;
    }
    for (i = n - 1; i >= 0; i--) {
      ret[i] = numeric.rep(s, v, k + 1);
    }
    return ret;
  },

  LU(A, fast) {
    fast = fast || false;

    var i, j, k, absAjk, Akk, Ak, Pk, Ai,
      max,
      n = A.length, n1 = n - 1,
      P = new Array(n);

    if (!fast) A = this.clone(A);

    for (k = 0; k < n; ++k) {
      Pk = k;
      Ak = A[k];
      max = Math.abs(Ak[k]);
      for (j = k + 1; j < n; ++j) {
        absAjk = Math.abs(A[j][k]);
        if (max < absAjk) {
          max = absAjk;
          Pk = j;
        }
      }
      P[k] = Pk;

      if (Pk != k) {
        A[k] = A[Pk];
        A[Pk] = Ak;
        Ak = A[k];
      }

      Akk = Ak[k];

      for (i = k + 1; i < n; ++i) {
        A[i][k] /= Akk;
      }

      for (i = k + 1; i < n; ++i) {
        Ai = A[i];
        for (j = k + 1; j < n1; ++j) {
          Ai[j] -= Ai[k] * Ak[j];
          ++j;
          Ai[j] -= Ai[k] * Ak[j];
        }
        if (j === n1) Ai[j] -= Ai[k] * Ak[j];
      }
    }

    return {
      LU: A,
      P: P
    };
  },

  LUsolve(LUP, b) {
    var i, j,
      LU = LUP.LU,
      n = LU.length,
      x = this.clone(b),
      P = LUP.P,
      Pi, LUi, tmp;

    for (i = n - 1; i !== -1; --i) x[i] = b[i];
    for (i = 0; i < n; ++i) {
      Pi = P[i];
      if (P[i] !== i) tmp = x[i], x[i] = x[Pi], x[Pi] = tmp;
      LUi = LU[i];
      for (j = 0; j < i; ++j) {
        x[i] -= x[j] * LUi[j];
      }
    }

    for (i = n - 1; i >= 0; --i) {
      LUi = LU[i];
      for (j = i + 1; j < n; ++j) {
        x[i] -= x[j] * LUi[j];
      }
      x[i] /= LUi[i];
    }

    return x;
  },

  solve(A, b, fast) {
    return this.LUsolve(this.LU(A, fast), b);
  },

  identity(n) {
    return numeric.diag(numeric.rep([n], 1));
  },

  inv(a) {
    const s = numeric.dim(a), abs = Math.abs, m = s[0], n = s[1];
    const A = numeric.clone(a);
    let Ai, Aj;
    const I = numeric.identity(m);
    let Ii, Ij;
    let i, j, k, x;
    for (j = 0; j < n; ++j) {
      let i0 = -1;
      let v0 = -1;
      for (i = j; i !== m; ++i) {
        k = abs(A[i][j]);
        if (k > v0) {
          i0 = i;
          v0 = k;
        }
      }
      Aj = A[i0];
      A[i0] = A[j];
      A[j] = Aj;
      Ij = I[i0];
      I[i0] = I[j];
      I[j] = Ij;
      x = Aj[j];
      for (k = j; k !== n; ++k) Aj[k] /= x;
      for (k = n - 1; k !== -1; --k) Ij[k] /= x;
      for (i = m - 1; i !== -1; --i) {
        if (i !== j) {
          Ai = A[i];
          Ii = I[i];
          x = Ai[j];
          for (k = j + 1; k !== n; ++k) Ai[k] -= Aj[k] * x;
          for (k = n - 1; k > 0; --k) {
            Ii[k] -= Ij[k] * x;
            --k;
            Ii[k] -= Ij[k] * x;
          }
          if (k === 0) Ii[0] -= Ij[0] * x;
        }
      }
    }
    return I;
  },

  dotMMsmall(x, y) {
    let i, j, k, p, q, r, ret, foo, bar, woo, i0;
    p = x.length;
    q = y.length;
    r = y[0].length;
    ret = Array(p);
    for (i = p - 1; i >= 0; i--) {
      foo = Array(r);
      bar = x[i];
      for (k = r - 1; k >= 0; k--) {
        woo = bar[q - 1] * y[q - 1][k];
        for (j = q - 2; j >= 1; j -= 2) {
          i0 = j - 1;
          woo += bar[j] * y[j][k] + bar[i0] * y[i0][k];
        }
        if (j === 0) {
          woo += bar[0] * y[0][k];
        }
        foo[k] = woo;
      }
      ret[i] = foo;
    }
    return ret;
  },

  dotMV(x, y) {
    const p = x.length;
    let i;
    const ret = Array(p), dotVV = numeric.dotVV;
    for (i = p - 1; i >= 0; i--) {
      ret[i] = dotVV(x[i], y);
    }
    return ret;
  },

  dotVV(x, y) {
    let i;
    const n = x.length;
    let i1, ret = x[n - 1] * y[n - 1];
    for (i = n - 2; i >= 1; i -= 2) {
      i1 = i - 1;
      ret += x[i] * y[i] + x[i1] * y[i1];
    }
    if (i === 0) {
      ret += x[0] * y[0];
    }
    return ret;
  },

  transpose(x) {
    let i, j;
    const m = x.length, n = x[0].length, ret = Array(n);
    let A0, A1, Bj;
    for (j = 0; j < n; j++) ret[j] = Array(m);
    for (i = m - 1; i >= 1; i -= 2) {
      A1 = x[i];
      A0 = x[i - 1];
      for (j = n - 1; j >= 1; --j) {
        Bj = ret[j];
        Bj[i] = A1[j];
        Bj[i - 1] = A0[j];
        --j;
        Bj = ret[j];
        Bj[i] = A1[j];
        Bj[i - 1] = A0[j];
      }
      if (j === 0) {
        Bj = ret[0];
        Bj[i] = A1[0];
        Bj[i - 1] = A0[0];
      }
    }
    if (i === 0) {
      A0 = x[0];
      for (j = n - 1; j >= 1; --j) {
        ret[j][0] = A0[j];
        --j;
        ret[j][0] = A0[j];
      }
      if (j === 0) {
        ret[0][0] = A0[0];
      }
    }
    return ret;
  }
};

export default numeric;
