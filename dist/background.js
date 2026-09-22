//#region node_modules/@noble/ciphers/utils.js
function e(e) {
	return e instanceof Uint8Array || ArrayBuffer.isView(e) && e.constructor.name === "Uint8Array" && "BYTES_PER_ELEMENT" in e && e.BYTES_PER_ELEMENT === 1;
}
var t = (e) => e ? `"${e}" ` : "";
function n(e, n = "") {
	if (typeof e != "boolean") throw TypeError(t(n) + "expected boolean, got type=" + typeof e);
	return e;
}
function r(e, n = "") {
	if (typeof e != "number") throw TypeError(t(n) + "expected number, got " + typeof e);
	if (!Number.isSafeInteger(e) || e < 0) throw RangeError(t(n) + "expected integer >= 0, got " + e);
	return e;
}
function i(n, i, a = "") {
	if (e(n) && (i === void 0 || n.length === i)) return n;
	i !== void 0 && r(i, "length");
	let o = e(n), s = i === void 0 ? "" : ` of length ${i}`, c = o ? `length=${n.length}` : `type=${typeof n}`, l = t(a) + "expected Uint8Array" + s + ", got " + c;
	throw o ? RangeError(l) : TypeError(l);
}
var a = (e, t) => {
	if (typeof e != "object" || !e || Array.isArray(e)) throw TypeError(t === "object" ? "expected valid options object" : `"${t}" expected object, got type=${typeof e}`);
};
function o(e, t = !0) {
	if (e.destroyed) throw Error("hash was destroyed");
	if (t && e.finished) throw Error("digest() was already called");
}
function s(e, t) {
	i(e, void 0, "output");
	let n = t.outputLen;
	if (!(e.length >= n)) throw RangeError("\"output\" expected length >= " + n);
}
function c(e) {
	return new Uint32Array(e.buffer, e.byteOffset, Math.floor(e.byteLength / 4));
}
function l(...e) {
	for (let t = 0; t < e.length; t++) e[t].fill(0);
}
function u(e) {
	return new DataView(e.buffer, e.byteOffset, e.byteLength);
}
var d = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
function f(e) {
	return e << 24 & 4278190080 | e << 8 & 16711680 | e >>> 8 & 65280 | e >>> 24 & 255;
}
function p(e) {
	for (let t = 0; t < e.length; t++) e[t] = f(e[t]);
	return e;
}
var m = d ? (e) => e : p;
function h(e, t) {
	return !e.byteLength || !t.byteLength ? !1 : e.buffer === t.buffer && e.byteOffset < t.byteOffset + t.byteLength && t.byteOffset < e.byteOffset + e.byteLength;
}
function g(e, t) {
	if (h(e, t) && e.byteOffset < t.byteOffset) throw Error("complex overlap of input and output is not supported");
}
function _(e, t) {
	return a(e, "defaults"), a(t, "opts"), Object.assign(e, t);
}
function v(e, t) {
	if (e = i(e), t = i(t), e.length !== t.length) return !1;
	let n = 0;
	for (let r = 0; r < e.length; r++) n |= e[r] ^ t[r];
	return n === 0;
}
function y(e, t, n) {
	let r = t, i = n || (() => []), a = (e, t) => r(t, ...i(e)).update(e).digest(), o = r(new Uint8Array(e), ...i(/* @__PURE__ */ new Uint8Array()));
	return a.outputLen = o.outputLen, a.blockLen = o.blockLen, a.create = (e, ...t) => r(e, ...t), a;
}
var b = (t, n) => {
	function r(r, ...a) {
		if (i(r, void 0, "key"), t.nonceLength !== void 0) {
			let e = a[0];
			i(e, t.varSizeNonce ? void 0 : t.nonceLength, "nonce");
		}
		let o = t.tagLength, s = t.nonceLength === void 0 ? 0 : 1;
		if (!t.withAAD) {
			for (let t = s; t < a.length; t++) if (e(a[t])) throw Error("AAD not supported");
		}
		t.withAAD && a[s] !== void 0 && i(a[s], void 0, "AAD");
		let c = n(r, ...a), l = (e, t) => {
			if (t !== void 0) {
				if (e !== 2) throw Error("cipher output not supported");
				i(t, void 0, "output");
			}
		}, u = !1;
		return {
			encrypt(e, t) {
				if (u) throw Error("cannot encrypt() twice with same key + nonce");
				return u = !0, i(e, void 0, "data"), l(c.encrypt.length, t), c.encrypt(e, t);
			},
			decrypt(e, t) {
				if (i(e, void 0, "data"), o && e.length < o) throw Error("\"ciphertext\" expected length >= tagLength=" + o);
				return l(c.decrypt.length, t), c.decrypt(e, t);
			}
		};
	}
	return Object.assign(r, t), r;
};
function ee(e, t, n = !0) {
	if (t === void 0) return new Uint8Array(e);
	if (i(t, e, "output"), n && !S(t)) throw Error("invalid output, must be aligned");
	return t;
}
function x(e, t, i) {
	r(e), r(t), n(i);
	let a = /* @__PURE__ */ new Uint8Array(16), o = u(a);
	return o.setBigUint64(0, BigInt(t), i), o.setBigUint64(8, BigInt(e), i), a;
}
function S(e) {
	return e.byteOffset % 4 == 0;
}
function C(e) {
	return Uint8Array.from(i(e));
}
//#endregion
//#region node_modules/@noble/ciphers/_arx.js
var w = (e) => Uint8Array.from(e.split(""), (e) => e.charCodeAt(0)), T = /* @__PURE__ */ m(c(w("expand 16-byte k"))), E = /* @__PURE__ */ m(c(w("expand 32-byte k")));
function D(e, t) {
	return e << t | e >>> 32 - t;
}
var O = 64, k = 16, A = 2 ** 32 - 1, j = /* @__PURE__ */ Uint32Array.of();
function M(e, t, n, r, i, a, o, s) {
	let l = i.length, u = new Uint8Array(O), f = c(u), p = d && S(i) && S(a), h = p ? c(i) : j, g = p ? c(a) : j;
	if (!d) {
		for (let c = 0; c < l; o++) {
			if (e(t, n, r, f, o, s), m(f), o >= A) throw Error("arx: counter overflow");
			let d = Math.min(O, l - c);
			for (let e = 0, t; e < d; e++) t = c + e, a[t] = i[t] ^ u[e];
			c += d;
		}
		return;
	}
	for (let c = 0; c < l; o++) {
		if (e(t, n, r, f, o, s), o >= A) throw Error("arx: counter overflow");
		let d = Math.min(O, l - c);
		if (p && d === O) {
			let e = c / 4;
			if (c % 4 != 0) throw Error("arx: invalid block position");
			for (let t = 0, n; t < k; t++) n = e + t, g[n] = h[n] ^ f[t];
			c += O;
			continue;
		}
		for (let e = 0, t; e < d; e++) t = c + e, a[t] = i[t] ^ u[e];
		c += d;
	}
}
function N(e, t) {
	let { allowShortKeys: a, extendNonceFn: o, counterLength: s, counterRight: u, rounds: f } = _({
		allowShortKeys: !1,
		counterLength: 8,
		counterRight: !1,
		rounds: 20
	}, t);
	if (typeof e != "function") throw Error("core must be a function");
	return r(s), r(f), n(u), n(a), (t, n, p, h, _ = 0) => {
		i(t, void 0, "key"), i(n, void 0, "nonce"), i(p, void 0, "data");
		let v = p.length, y = h !== void 0;
		if (h = ee(v, h, !1), y && g(p, h), r(_), _ < 0 || _ >= A) throw Error("arx: counter overflow");
		let b = [], x = t.length, w, D;
		if (x === 32) b.push(w = C(t)), D = E;
		else if (x === 16 && a) w = /* @__PURE__ */ new Uint8Array(32), w.set(t), w.set(t, 16), D = T, b.push(w);
		else throw i(t, 32, "arx key"), Error("invalid key size");
		(!d || !S(n)) && b.push(n = C(n));
		let O = c(w);
		if (o) {
			if (n.length !== 24) throw Error("arx: extended nonce must be 24 bytes");
			let e = n.subarray(0, 16);
			if (d) o(D, O, c(e), O);
			else {
				let t = m(Uint32Array.from(D));
				o(t, O, c(e), O), l(t), m(O);
			}
			n = n.subarray(16);
		} else d || m(O);
		let k = 16 - s;
		if (k !== n.length) throw Error(`arx: nonce must be ${k} or 16 bytes`);
		if (k !== 12) {
			let e = /* @__PURE__ */ new Uint8Array(12);
			e.set(n, u ? 0 : 12 - n.length), n = e, b.push(n);
		}
		let j = m(c(n));
		try {
			return M(e, D, O, j, p, h, _, f), h;
		} finally {
			l(...b);
		}
	};
}
//#endregion
//#region node_modules/@noble/ciphers/_poly1305.js
function P(e, t) {
	return e[t++] & 255 | (e[t++] & 255) << 8;
}
var F = class {
	blockLen = 16;
	outputLen = 16;
	buffer = /* @__PURE__ */ new Uint8Array(16);
	r = /* @__PURE__ */ new Uint16Array(10);
	h = /* @__PURE__ */ new Uint16Array(10);
	pad = /* @__PURE__ */ new Uint16Array(8);
	pos = 0;
	finished = !1;
	destroyed = !1;
	constructor(e) {
		e = C(i(e, 32, "key"));
		let t = P(e, 0), n = P(e, 2), r = P(e, 4), a = P(e, 6), o = P(e, 8), s = P(e, 10), c = P(e, 12), l = P(e, 14);
		this.r[0] = t & 8191, this.r[1] = (t >>> 13 | n << 3) & 8191, this.r[2] = (n >>> 10 | r << 6) & 7939, this.r[3] = (r >>> 7 | a << 9) & 8191, this.r[4] = (a >>> 4 | o << 12) & 255, this.r[5] = o >>> 1 & 8190, this.r[6] = (o >>> 14 | s << 2) & 8191, this.r[7] = (s >>> 11 | c << 5) & 8065, this.r[8] = (c >>> 8 | l << 8) & 8191, this.r[9] = l >>> 5 & 127;
		for (let t = 0; t < 8; t++) this.pad[t] = P(e, 16 + 2 * t);
	}
	process(e, t, n = !1) {
		let r = n ? 0 : 2048, { h: i, r: a } = this, o = a[0], s = a[1], c = a[2], l = a[3], u = a[4], d = a[5], f = a[6], p = a[7], m = a[8], h = a[9], g = P(e, t + 0), _ = P(e, t + 2), v = P(e, t + 4), y = P(e, t + 6), b = P(e, t + 8), ee = P(e, t + 10), x = P(e, t + 12), S = P(e, t + 14), C = i[0] + (g & 8191), w = i[1] + ((g >>> 13 | _ << 3) & 8191), T = i[2] + ((_ >>> 10 | v << 6) & 8191), E = i[3] + ((v >>> 7 | y << 9) & 8191), D = i[4] + ((y >>> 4 | b << 12) & 8191), O = i[5] + (b >>> 1 & 8191), k = i[6] + ((b >>> 14 | ee << 2) & 8191), A = i[7] + ((ee >>> 11 | x << 5) & 8191), j = i[8] + ((x >>> 8 | S << 8) & 8191), M = i[9] + (S >>> 5 | r), N = 0, F = N + C * o + 5 * h * w + 5 * m * T + 5 * p * E + 5 * f * D;
		N = F >>> 13, F &= 8191, F += 5 * d * O + 5 * u * k + 5 * l * A + 5 * c * j + 5 * s * M, N += F >>> 13, F &= 8191;
		let I = N + C * s + w * o + 5 * h * T + 5 * m * E + 5 * p * D;
		N = I >>> 13, I &= 8191, I += 5 * f * O + 5 * d * k + 5 * u * A + 5 * l * j + 5 * c * M, N += I >>> 13, I &= 8191;
		let L = N + C * c + w * s + T * o + 5 * h * E + 5 * m * D;
		N = L >>> 13, L &= 8191, L += 5 * p * O + 5 * f * k + 5 * d * A + 5 * u * j + 5 * l * M, N += L >>> 13, L &= 8191;
		let R = N + C * l + w * c + T * s + E * o + 5 * h * D;
		N = R >>> 13, R &= 8191, R += 5 * m * O + 5 * p * k + 5 * f * A + 5 * d * j + 5 * u * M, N += R >>> 13, R &= 8191;
		let te = N + C * u + w * l + T * c + E * s + D * o;
		N = te >>> 13, te &= 8191, te += 5 * h * O + 5 * m * k + 5 * p * A + 5 * f * j + 5 * d * M, N += te >>> 13, te &= 8191;
		let z = N + C * d + w * u + T * l + E * c + D * s;
		N = z >>> 13, z &= 8191, z += O * o + 5 * h * k + 5 * m * A + 5 * p * j + 5 * f * M, N += z >>> 13, z &= 8191;
		let B = N + C * f + w * d + T * u + E * l + D * c;
		N = B >>> 13, B &= 8191, B += O * s + k * o + 5 * h * A + 5 * m * j + 5 * p * M, N += B >>> 13, B &= 8191;
		let V = N + C * p + w * f + T * d + E * u + D * l;
		N = V >>> 13, V &= 8191, V += O * c + k * s + A * o + 5 * h * j + 5 * m * M, N += V >>> 13, V &= 8191;
		let H = N + C * m + w * p + T * f + E * d + D * u;
		N = H >>> 13, H &= 8191, H += O * l + k * c + A * s + j * o + 5 * h * M, N += H >>> 13, H &= 8191;
		let U = N + C * h + w * m + T * p + E * f + D * d;
		N = U >>> 13, U &= 8191, U += O * u + k * l + A * c + j * s + M * o, N += U >>> 13, U &= 8191, N = (N << 2) + N | 0, N = N + F | 0, F = N & 8191, N >>>= 13, I += N, i[0] = F, i[1] = I, i[2] = L, i[3] = R, i[4] = te, i[5] = z, i[6] = B, i[7] = V, i[8] = H, i[9] = U;
	}
	finalize() {
		let { h: e, pad: t } = this, n = /* @__PURE__ */ new Uint16Array(10), r = e[1] >>> 13;
		e[1] &= 8191;
		for (let t = 2; t < 10; t++) e[t] += r, r = e[t] >>> 13, e[t] &= 8191;
		e[0] += r * 5, r = e[0] >>> 13, e[0] &= 8191, e[1] += r, r = e[1] >>> 13, e[1] &= 8191, e[2] += r, n[0] = e[0] + 5, r = n[0] >>> 13, n[0] &= 8191;
		for (let t = 1; t < 10; t++) n[t] = e[t] + r, r = n[t] >>> 13, n[t] &= 8191;
		n[9] -= 8192;
		let i = (r ^ 1) - 1;
		for (let e = 0; e < 10; e++) n[e] &= i;
		i = ~i;
		for (let t = 0; t < 10; t++) e[t] = e[t] & i | n[t];
		e[0] = (e[0] | e[1] << 13) & 65535, e[1] = (e[1] >>> 3 | e[2] << 10) & 65535, e[2] = (e[2] >>> 6 | e[3] << 7) & 65535, e[3] = (e[3] >>> 9 | e[4] << 4) & 65535, e[4] = (e[4] >>> 12 | e[5] << 1 | e[6] << 14) & 65535, e[5] = (e[6] >>> 2 | e[7] << 11) & 65535, e[6] = (e[7] >>> 5 | e[8] << 8) & 65535, e[7] = (e[8] >>> 8 | e[9] << 5) & 65535;
		let a = e[0] + t[0];
		e[0] = a & 65535;
		for (let n = 1; n < 8; n++) a = (e[n] + t[n] | 0) + (a >>> 16) | 0, e[n] = a & 65535;
		l(n);
	}
	update(e) {
		o(this), i(e), e = C(e);
		let { buffer: t, blockLen: n } = this, r = e.length;
		for (let i = 0; i < r;) {
			let a = Math.min(n - this.pos, r - i);
			if (a === n) {
				for (; n <= r - i; i += n) this.process(e, i);
				continue;
			}
			t.set(e.subarray(i, i + a), this.pos), this.pos += a, i += a, this.pos === n && (this.process(t, 0, !1), this.pos = 0);
		}
		return this;
	}
	destroy() {
		this.destroyed = !0, l(this.h, this.r, this.buffer, this.pad);
	}
	digestInto(e) {
		o(this), s(e, this), this.finished = !0;
		let { buffer: t, h: n } = this, { pos: r } = this;
		if (r) {
			for (t[r++] = 1; r < 16; r++) t[r] = 0;
			this.process(t, 0, !0);
		}
		this.finalize();
		let i = 0;
		for (let t = 0; t < 8; t++) e[i++] = n[t] >>> 0, e[i++] = n[t] >>> 8;
	}
	digest() {
		let { buffer: e, outputLen: t } = this;
		this.digestInto(e);
		let n = e.slice(0, t);
		return this.destroy(), n;
	}
}, I = /* @__PURE__ */ y(32, (e) => new F(e));
//#endregion
//#region node_modules/@noble/ciphers/chacha.js
function L(e, t, n, r, i, a = 20) {
	let o = e[0], s = e[1], c = e[2], l = e[3], u = t[0], d = t[1], f = t[2], p = t[3], m = t[4], h = t[5], g = t[6], _ = t[7], v = i, y = n[0], b = n[1], ee = n[2], x = o, S = s, C = c, w = l, T = u, E = d, O = f, k = p, A = m, j = h, M = g, N = _, P = v, F = y, I = b, L = ee;
	for (let e = 0; e < a; e += 2) x = x + T | 0, P = D(P ^ x, 16), A = A + P | 0, T = D(T ^ A, 12), x = x + T | 0, P = D(P ^ x, 8), A = A + P | 0, T = D(T ^ A, 7), S = S + E | 0, F = D(F ^ S, 16), j = j + F | 0, E = D(E ^ j, 12), S = S + E | 0, F = D(F ^ S, 8), j = j + F | 0, E = D(E ^ j, 7), C = C + O | 0, I = D(I ^ C, 16), M = M + I | 0, O = D(O ^ M, 12), C = C + O | 0, I = D(I ^ C, 8), M = M + I | 0, O = D(O ^ M, 7), w = w + k | 0, L = D(L ^ w, 16), N = N + L | 0, k = D(k ^ N, 12), w = w + k | 0, L = D(L ^ w, 8), N = N + L | 0, k = D(k ^ N, 7), x = x + E | 0, L = D(L ^ x, 16), M = M + L | 0, E = D(E ^ M, 12), x = x + E | 0, L = D(L ^ x, 8), M = M + L | 0, E = D(E ^ M, 7), S = S + O | 0, P = D(P ^ S, 16), N = N + P | 0, O = D(O ^ N, 12), S = S + O | 0, P = D(P ^ S, 8), N = N + P | 0, O = D(O ^ N, 7), C = C + k | 0, F = D(F ^ C, 16), A = A + F | 0, k = D(k ^ A, 12), C = C + k | 0, F = D(F ^ C, 8), A = A + F | 0, k = D(k ^ A, 7), w = w + T | 0, I = D(I ^ w, 16), j = j + I | 0, T = D(T ^ j, 12), w = w + T | 0, I = D(I ^ w, 8), j = j + I | 0, T = D(T ^ j, 7);
	let R = 0;
	r[R++] = o + x | 0, r[R++] = s + S | 0, r[R++] = c + C | 0, r[R++] = l + w | 0, r[R++] = u + T | 0, r[R++] = d + E | 0, r[R++] = f + O | 0, r[R++] = p + k | 0, r[R++] = m + A | 0, r[R++] = h + j | 0, r[R++] = g + M | 0, r[R++] = _ + N | 0, r[R++] = v + P | 0, r[R++] = y + F | 0, r[R++] = b + I | 0, r[R++] = ee + L | 0;
}
var R = /* @__PURE__ */ N(L, {
	counterRight: !1,
	counterLength: 4,
	allowShortKeys: !1
}), te = /* @__PURE__ */ new Uint8Array(16), z = (e, t) => {
	e.update(t);
	let n = t.length % 16;
	n && e.update(te.subarray(n));
}, B = /* @__PURE__ */ new Uint8Array(32);
function V(e, t, n, r, a) {
	a !== void 0 && i(a, void 0, "AAD");
	let o = e(t, n, B), s = x(r.length, a ? a.length : 0, !0), c = I.create(o);
	a && z(c, a), z(c, r), c.update(s);
	let u = c.digest();
	return l(o, s), u;
}
var H = /* @__PURE__ */ b({
	blockSize: 64,
	nonceLength: 12,
	tagLength: 16,
	withAAD: !0
}, /* @__PURE__ */ ((e) => (t, n, r) => ({
	encrypt(i, a) {
		let o = i.length;
		a = ee(o + 16, a, !1), a.set(i);
		let s = a.subarray(0, -16);
		e(t, n, s, s, 1);
		let c = V(e, t, n, s, r);
		return a.set(c, o), l(c), a;
	},
	decrypt(i, a) {
		a = ee(i.length - 16, a, !1);
		let o = i.subarray(0, -16), s = i.subarray(-16), c = V(e, t, n, o, r);
		if (!v(s, c)) throw l(c), Error("invalid tag");
		return a.set(i.subarray(0, -16)), e(t, n, a, a, 1), l(c), a;
	}
}))(R));
//#endregion
//#region node_modules/hash-wasm/dist/index.esm.js
function U(e, t, n, r) {
	function i(e) {
		return e instanceof n ? e : new n(function(t) {
			t(e);
		});
	}
	return new (n ||= Promise)(function(n, a) {
		function o(e) {
			try {
				c(r.next(e));
			} catch (e) {
				a(e);
			}
		}
		function s(e) {
			try {
				c(r.throw(e));
			} catch (e) {
				a(e);
			}
		}
		function c(e) {
			e.done ? n(e.value) : i(e.value).then(o, s);
		}
		c((r = r.apply(e, t || [])).next());
	});
}
var W = class {
	constructor() {
		this.mutex = Promise.resolve();
	}
	lock() {
		let e = () => {};
		return this.mutex = this.mutex.then(() => new Promise(e)), new Promise((t) => {
			e = t;
		});
	}
	dispatch(e) {
		return U(this, void 0, void 0, function* () {
			let t = yield this.lock();
			try {
				return yield Promise.resolve(e());
			} finally {
				t();
			}
		});
	}
};
function ne() {
	return typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : global;
}
var re = ne(), ie = re.Buffer ?? null, ae = re.TextEncoder ? new re.TextEncoder() : null;
function oe(e, t) {
	return (e & 15) + (e >> 6 | e >> 3 & 8) << 4 | (t & 15) + (t >> 6 | t >> 3 & 8);
}
function se(e, t) {
	let n = t.length >> 1;
	for (let r = 0; r < n; r++) {
		let n = r << 1;
		e[r] = oe(t.charCodeAt(n), t.charCodeAt(n + 1));
	}
}
function ce(e, t) {
	if (e.length !== t.length * 2) return !1;
	for (let n = 0; n < t.length; n++) {
		let r = n << 1;
		if (t[n] !== oe(e.charCodeAt(r), e.charCodeAt(r + 1))) return !1;
	}
	return !0;
}
var le = 87, ue = 48;
function de(e, t, n) {
	let r = 0;
	for (let i = 0; i < n; i++) {
		let n = t[i] >>> 4;
		e[r++] = n > 9 ? n + le : n + ue, n = t[i] & 15, e[r++] = n > 9 ? n + le : n + ue;
	}
	return String.fromCharCode.apply(null, e);
}
var G = ie === null ? (e) => {
	if (typeof e == "string") return ae.encode(e);
	if (ArrayBuffer.isView(e)) return new Uint8Array(e.buffer, e.byteOffset, e.byteLength);
	throw Error("Invalid data type!");
} : (e) => {
	if (typeof e == "string") {
		let t = ie.from(e, "utf8");
		return new Uint8Array(t.buffer, t.byteOffset, t.length);
	}
	if (ie.isBuffer(e)) return new Uint8Array(e.buffer, e.byteOffset, e.length);
	if (ArrayBuffer.isView(e)) return new Uint8Array(e.buffer, e.byteOffset, e.byteLength);
	throw Error("Invalid data type!");
}, K = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", fe = /* @__PURE__ */ new Uint8Array(256);
for (let e = 0; e < 64; e++) fe[K.charCodeAt(e)] = e;
function pe(e, t = !0) {
	let n = e.length, r = n % 3, i = [], a = n - r;
	for (let t = 0; t < a; t += 3) {
		let n = (e[t] << 16 & 16711680) + (e[t + 1] << 8 & 65280) + (e[t + 2] & 255), r = K.charAt(n >> 18 & 63) + K.charAt(n >> 12 & 63) + K.charAt(n >> 6 & 63) + K.charAt(n & 63);
		i.push(r);
	}
	if (r === 1) {
		let r = e[n - 1], a = K.charAt(r >> 2), o = K.charAt(r << 4 & 63);
		i.push(`${a}${o}`), t && i.push("==");
	} else if (r === 2) {
		let r = (e[n - 2] << 8) + e[n - 1], a = K.charAt(r >> 10), o = K.charAt(r >> 4 & 63), s = K.charAt(r << 2 & 63);
		i.push(`${a}${o}${s}`), t && i.push("=");
	}
	return i.join("");
}
function me(e) {
	let t = Math.floor(e.length * .75), n = e.length;
	return e[n - 1] === "=" && (--t, e[n - 2] === "=" && --t), t;
}
function he(e) {
	let t = me(e), n = e.length, r = new Uint8Array(t), i = 0;
	for (let t = 0; t < n; t += 4) {
		let n = fe[e.charCodeAt(t)], a = fe[e.charCodeAt(t + 1)], o = fe[e.charCodeAt(t + 2)], s = fe[e.charCodeAt(t + 3)];
		r[i] = n << 2 | a >> 4, i += 1, r[i] = (a & 15) << 4 | o >> 2, i += 1, r[i] = (o & 3) << 6 | s & 63, i += 1;
	}
	return r;
}
var ge = 16384, _e = 4, ve = new W(), ye = /* @__PURE__ */ new Map();
function be(e, t) {
	return U(this, void 0, void 0, function* () {
		let n = null, r = null, i = !1;
		if (typeof WebAssembly > "u") throw Error("WebAssembly is not supported in this environment!");
		let a = (e, t = 0) => {
			r.set(e, t);
		}, o = () => r, s = () => n.exports, c = (e) => {
			n.exports.Hash_SetMemorySize(e);
			let t = n.exports.Hash_GetBuffer(), i = n.exports.memory.buffer;
			r = new Uint8Array(i, t, e);
		}, l = () => new DataView(n.exports.memory.buffer).getUint32(n.exports.STATE_SIZE, !0), u = ve.dispatch(() => U(this, void 0, void 0, function* () {
			if (!ye.has(e.name)) {
				let t = he(e.data), n = WebAssembly.compile(t);
				ye.set(e.name, n);
			}
			let t = yield ye.get(e.name);
			n = yield WebAssembly.instantiate(t, {});
		})), d = () => U(this, void 0, void 0, function* () {
			n || (yield u);
			let e = n.exports.Hash_GetBuffer(), t = n.exports.memory.buffer;
			r = new Uint8Array(t, e, ge);
		}), f = (e = null) => {
			i = !0, n.exports.Hash_Init(e);
		}, p = (e) => {
			let t = 0;
			for (; t < e.length;) {
				let i = e.subarray(t, t + ge);
				t += i.length, r.set(i), n.exports.Hash_Update(i.length);
			}
		}, m = (e) => {
			if (!i) throw Error("update() called before init()");
			let t = G(e);
			p(t);
		}, h = new Uint8Array(t * 2), g = (e, a = null) => {
			if (!i) throw Error("digest() called before init()");
			return i = !1, n.exports.Hash_Final(a), e === "binary" ? r.slice(0, t) : de(h, r, t);
		}, _ = () => {
			if (!i) throw Error("save() can only be called after init() and before digest()");
			let t = n.exports.Hash_GetState(), r = l(), a = n.exports.memory.buffer, o = new Uint8Array(a, t, r), s = new Uint8Array(_e + r);
			return se(s, e.hash), s.set(o, _e), s;
		}, v = (t) => {
			if (!(t instanceof Uint8Array)) throw Error("load() expects an Uint8Array generated by save()");
			let r = n.exports.Hash_GetState(), a = l(), o = _e + a, s = n.exports.memory.buffer;
			if (t.length !== o) throw Error(`Bad state length (expected ${o} bytes, got ${t.length})`);
			if (!ce(e.hash, t.subarray(0, _e))) throw Error("This state was written by an incompatible hash implementation");
			let c = t.subarray(_e);
			new Uint8Array(s, r, a).set(c), i = !0;
		}, y = (e) => typeof e == "string" ? e.length < ge / 4 : e.byteLength < ge, b = y;
		switch (e.name) {
			case "argon2":
			case "scrypt":
				b = () => !0;
				break;
			case "blake2b":
			case "blake2s":
				b = (e, t) => t <= 512 && y(e);
				break;
			case "blake3":
				b = (e, t) => t === 0 && y(e);
				break;
			case "xxhash64":
			case "xxhash3":
			case "xxhash128":
			case "crc64": b = () => !1;
		}
		return yield d(), {
			getMemory: o,
			writeMemory: a,
			getExports: s,
			setMemorySize: c,
			init: f,
			update: m,
			digest: g,
			save: _,
			load: v,
			calculate: (e, i = null, a = null) => {
				if (!b(e, i)) return f(i), m(e), g("hex", a);
				let o = G(e);
				return r.set(o), n.exports.Hash_Calculate(o.length, i, a), de(h, r, t);
			},
			hashLength: t
		};
	});
}
new W();
var xe = {
	name: "argon2",
	data: "AGFzbQEAAAABKQVgAX8Bf2AAAX9gEH9/f39/f39/f39/f39/f38AYAR/f39/AGACf38AAwYFAAECAwQFBgEBAoCAAgYIAX8BQZCoBAsHQQQGbWVtb3J5AgASSGFzaF9TZXRNZW1vcnlTaXplAAAOSGFzaF9HZXRCdWZmZXIAAQ5IYXNoX0NhbGN1bGF0ZQAECvEyBVgBAn9BACEBAkAgAEEAKAKICCICRg0AAkAgACACayIAQRB2IABBgIB8cSAASWoiAEAAQX9HDQBB/wHADwtBACEBQQBBACkDiAggAEEQdK18NwOICAsgAcALcAECfwJAQQAoAoAIIgANAEEAPwBBEHQiADYCgAhBACgCiAgiAUGAgCBGDQACQEGAgCAgAWsiAEEQdiAAQYCAfHEgAElqIgBAAEF/Rw0AQQAPC0EAQQApA4gIIABBEHStfDcDiAhBACgCgAghAAsgAAvcDgECfiAAIAQpAwAiECAAKQMAIhF8IBFCAYZC/v///x+DIBBC/////w+DfnwiEDcDACAMIBAgDCkDAIVCIIkiEDcDACAIIBAgCCkDACIRfCARQgGGQv7///8fgyAQQv////8Pg358IhA3AwAgBCAQIAQpAwCFQiiJIhA3AwAgACAQIAApAwAiEXwgEEL/////D4MgEUIBhkL+////H4N+fCIQNwMAIAwgECAMKQMAhUIwiSIQNwMAIAggECAIKQMAIhF8IBBC/////w+DIBFCAYZC/v///x+DfnwiEDcDACAEIBAgBCkDAIVCAYk3AwAgASAFKQMAIhAgASkDACIRfCARQgGGQv7///8fgyAQQv////8Pg358IhA3AwAgDSAQIA0pAwCFQiCJIhA3AwAgCSAQIAkpAwAiEXwgEUIBhkL+////H4MgEEL/////D4N+fCIQNwMAIAUgECAFKQMAhUIoiSIQNwMAIAEgECABKQMAIhF8IBBC/////w+DIBFCAYZC/v///x+DfnwiEDcDACANIBAgDSkDAIVCMIkiEDcDACAJIBAgCSkDACIRfCAQQv////8PgyARQgGGQv7///8fg358IhA3AwAgBSAQIAUpAwCFQgGJNwMAIAIgBikDACIQIAIpAwAiEXwgEUIBhkL+////H4MgEEL/////D4N+fCIQNwMAIA4gECAOKQMAhUIgiSIQNwMAIAogECAKKQMAIhF8IBFCAYZC/v///x+DIBBC/////w+DfnwiEDcDACAGIBAgBikDAIVCKIkiEDcDACACIBAgAikDACIRfCAQQv////8PgyARQgGGQv7///8fg358IhA3AwAgDiAQIA4pAwCFQjCJIhA3AwAgCiAQIAopAwAiEXwgEEL/////D4MgEUIBhkL+////H4N+fCIQNwMAIAYgECAGKQMAhUIBiTcDACADIAcpAwAiECADKQMAIhF8IBFCAYZC/v///x+DIBBC/////w+DfnwiEDcDACAPIBAgDykDAIVCIIkiEDcDACALIBAgCykDACIRfCARQgGGQv7///8fgyAQQv////8Pg358IhA3AwAgByAQIAcpAwCFQiiJIhA3AwAgAyAQIAMpAwAiEXwgEEL/////D4MgEUIBhkL+////H4N+fCIQNwMAIA8gECAPKQMAhUIwiSIQNwMAIAsgECALKQMAIhF8IBBC/////w+DIBFCAYZC/v///x+DfnwiEDcDACAHIBAgBykDAIVCAYk3AwAgACAFKQMAIhAgACkDACIRfCARQgGGQv7///8fgyAQQv////8Pg358IhA3AwAgDyAQIA8pAwCFQiCJIhA3AwAgCiAQIAopAwAiEXwgEUIBhkL+////H4MgEEL/////D4N+fCIQNwMAIAUgECAFKQMAhUIoiSIQNwMAIAAgECAAKQMAIhF8IBBC/////w+DIBFCAYZC/v///x+DfnwiEDcDACAPIBAgDykDAIVCMIkiEDcDACAKIBAgCikDACIRfCAQQv////8PgyARQgGGQv7///8fg358IhA3AwAgBSAQIAUpAwCFQgGJNwMAIAEgBikDACIQIAEpAwAiEXwgEUIBhkL+////H4MgEEL/////D4N+fCIQNwMAIAwgECAMKQMAhUIgiSIQNwMAIAsgECALKQMAIhF8IBFCAYZC/v///x+DIBBC/////w+DfnwiEDcDACAGIBAgBikDAIVCKIkiEDcDACABIBAgASkDACIRfCAQQv////8PgyARQgGGQv7///8fg358IhA3AwAgDCAQIAwpAwCFQjCJIhA3AwAgCyAQIAspAwAiEXwgEEL/////D4MgEUIBhkL+////H4N+fCIQNwMAIAYgECAGKQMAhUIBiTcDACACIAcpAwAiECACKQMAIhF8IBFCAYZC/v///x+DIBBC/////w+DfnwiEDcDACANIBAgDSkDAIVCIIkiEDcDACAIIBAgCCkDACIRfCARQgGGQv7///8fgyAQQv////8Pg358IhA3AwAgByAQIAcpAwCFQiiJIhA3AwAgAiAQIAIpAwAiEXwgEEL/////D4MgEUIBhkL+////H4N+fCIQNwMAIA0gECANKQMAhUIwiSIQNwMAIAggECAIKQMAIhF8IBBC/////w+DIBFCAYZC/v///x+DfnwiEDcDACAHIBAgBykDAIVCAYk3AwAgAyAEKQMAIhAgAykDACIRfCARQgGGQv7///8fgyAQQv////8Pg358IhA3AwAgDiAQIA4pAwCFQiCJIhA3AwAgCSAQIAkpAwAiEXwgEUIBhkL+////H4MgEEL/////D4N+fCIQNwMAIAQgECAEKQMAhUIoiSIQNwMAIAMgECADKQMAIhF8IBBC/////w+DIBFCAYZC/v///x+DfnwiEDcDACAOIBAgDikDAIVCMIkiEDcDACAJIBAgCSkDACIRfCAQQv////8PgyARQgGGQv7///8fg358IhA3AwAgBCAQIAQpAwCFQgGJNwMAC98aAQN/QQAhBEEAIAIpAwAgASkDAIU3A5AIQQAgAikDCCABKQMIhTcDmAhBACACKQMQIAEpAxCFNwOgCEEAIAIpAxggASkDGIU3A6gIQQAgAikDICABKQMghTcDsAhBACACKQMoIAEpAyiFNwO4CEEAIAIpAzAgASkDMIU3A8AIQQAgAikDOCABKQM4hTcDyAhBACACKQNAIAEpA0CFNwPQCEEAIAIpA0ggASkDSIU3A9gIQQAgAikDUCABKQNQhTcD4AhBACACKQNYIAEpA1iFNwPoCEEAIAIpA2AgASkDYIU3A/AIQQAgAikDaCABKQNohTcD+AhBACACKQNwIAEpA3CFNwOACUEAIAIpA3ggASkDeIU3A4gJQQAgAikDgAEgASkDgAGFNwOQCUEAIAIpA4gBIAEpA4gBhTcDmAlBACACKQOQASABKQOQAYU3A6AJQQAgAikDmAEgASkDmAGFNwOoCUEAIAIpA6ABIAEpA6ABhTcDsAlBACACKQOoASABKQOoAYU3A7gJQQAgAikDsAEgASkDsAGFNwPACUEAIAIpA7gBIAEpA7gBhTcDyAlBACACKQPAASABKQPAAYU3A9AJQQAgAikDyAEgASkD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",
	hash: "e4cdc523"
}, Se = {
	name: "blake2b",
	data: "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",
	hash: "c6f286e6"
};
new W();
function Ce(e) {
	return !Number.isInteger(e) || e < 8 || e > 512 || e % 8 != 0 ? /* @__PURE__ */ Error("Invalid variant! Valid values: 8, 16, ..., 512") : null;
}
function we(e, t) {
	return e | t << 16;
}
function Te(e = 512, t = null) {
	if (Ce(e)) return Promise.reject(Ce(e));
	let n = null, r = e;
	if (t !== null) {
		if (n = G(t), n.length > 64) return Promise.reject(/* @__PURE__ */ Error("Max key length is 64 bytes"));
		r = we(e, n.length);
	}
	let i = e / 8;
	return be(Se, i).then((e) => {
		r > 512 && e.writeMemory(n), e.init(r);
		let t = {
			init: r > 512 ? () => (e.writeMemory(n), e.init(r), t) : () => (e.init(r), t),
			update: (n) => (e.update(n), t),
			digest: (t) => e.digest(t),
			save: () => e.save(),
			load: (n) => (e.load(n), t),
			blockSize: 128,
			digestSize: i
		};
		return t;
	});
}
function Ee(e, t, n) {
	let r = [
		`m=${t.memorySize}`,
		`t=${t.iterations}`,
		`p=${t.parallelism}`
	].join(",");
	return `$argon2${t.hashType}$v=19$${r}$${pe(e, !1)}$${pe(n, !1)}`;
}
var De = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(4));
function q(e) {
	return De.setInt32(0, e, !0), new Uint8Array(De.buffer);
}
function Oe(e, t, n) {
	return U(this, void 0, void 0, function* () {
		if (n <= 64) {
			let e = yield Te(n * 8);
			return e.update(q(n)), e.update(t), e.digest("binary");
		}
		let r = Math.ceil(n / 32) - 2, i = new Uint8Array(n);
		e.init(), e.update(q(n)), e.update(t);
		let a = e.digest("binary");
		i.set(a.subarray(0, 32), 0);
		for (let t = 1; t < r; t++) e.init(), e.update(a), a = e.digest("binary"), i.set(a.subarray(0, 32), t * 32);
		let o = n - 32 * r, s;
		return o === 64 ? (s = e, s.init()) : s = yield Te(o * 8), s.update(a), a = s.digest("binary"), i.set(a.subarray(0, o), r * 32), i;
	});
}
function ke(e) {
	switch (e) {
		case "d": return 0;
		case "i": return 1;
		default: return 2;
	}
}
function Ae(e) {
	return U(this, void 0, void 0, function* () {
		let { parallelism: t, iterations: n, hashLength: r } = e, i = G(e.password), a = G(e.salt), o = ke(e.hashType), { memorySize: s } = e, c = G(e.secret ?? ""), [l, u] = yield Promise.all([be(xe, 1024), Te(512)]);
		l.setMemorySize(s * 1024 + 1024);
		let d = /* @__PURE__ */ new Uint8Array(24), f = new DataView(d.buffer);
		f.setInt32(0, t, !0), f.setInt32(4, r, !0), f.setInt32(8, s, !0), f.setInt32(12, n, !0), f.setInt32(16, 19, !0), f.setInt32(20, o, !0), l.writeMemory(d, s * 1024), u.init(), u.update(d), u.update(q(i.length)), u.update(i), u.update(q(a.length)), u.update(a), u.update(q(c.length)), u.update(c), u.update(q(0));
		let p = Math.floor(s / (t * 4)) * 4, m = /* @__PURE__ */ new Uint8Array(72), h = u.digest("binary");
		m.set(h);
		for (let e = 0; e < t; e++) {
			m.set(q(0), 64), m.set(q(e), 68);
			let t = e * p, n = yield Oe(u, m, 1024);
			l.writeMemory(n, t * 1024), t += 1, m.set(q(1), 64), n = yield Oe(u, m, 1024), l.writeMemory(n, t * 1024);
		}
		let g = /* @__PURE__ */ new Uint8Array(1024);
		se(g, l.calculate(new Uint8Array([]), s));
		let _ = yield Oe(u, g, r);
		return e.outputType === "hex" ? de(new Uint8Array(r * 2), _, r) : e.outputType === "encoded" ? Ee(a, e, _) : _;
	});
}
var je = (e) => {
	if (!e || typeof e != "object") throw Error("Invalid options parameter. It requires an object.");
	if (!e.password || (e.password = G(e.password), e.password.length < 1)) throw Error("Password must be specified");
	if (!e.salt) throw Error("Salt must be specified");
	if (e.salt = G(e.salt), e.salt.length < 8) throw Error("Salt should be at least 8 bytes long");
	if (e.secret = G(e.secret ?? ""), !Number.isInteger(e.iterations) || e.iterations < 1) throw Error("Iterations should be a positive number");
	if (!Number.isInteger(e.parallelism) || e.parallelism < 1) throw Error("Parallelism should be a positive number");
	if (!Number.isInteger(e.hashLength) || e.hashLength < 4) throw Error("Hash length should be at least 4 bytes.");
	if (!Number.isInteger(e.memorySize)) throw Error("Memory size should be specified.");
	if (e.memorySize < 8 * e.parallelism) throw Error("Memory size should be at least 8 * parallelism.");
	if (e.outputType === void 0 && (e.outputType = "hex"), ![
		"hex",
		"binary",
		"encoded"
	].includes(e.outputType)) throw Error(`Insupported output type ${e.outputType}. Valid values: ['hex', 'binary', 'encoded']`);
};
function Me(e) {
	return U(this, void 0, void 0, function* () {
		return je(e), Ae(Object.assign(Object.assign({}, e), { hashType: "id" }));
	});
}
new W(), new W(), new W(), new W(), new W(), new W(), new W(), new W(), new W(), new W(), new W(), new W(), new W(), new W(), new W(), new W(), new W(), new W(), new W(), new W();
//#endregion
//#region src/crypto/gvdv.ts
var J = class extends Error {
	code;
	constructor(e, t, n) {
		super(t, n), this.name = "VaultCryptoError", this.code = e;
	}
}, Ne = "GVDV1\n", Pe = "GVDV1:", Fe = "argon2id-default", Ie = Object.freeze({
	memorySizeKiB: 19456,
	iterations: 2,
	parallelism: 1,
	version: 19,
	keyLength: 32
}), Le = 16, Re = 12, ze = 16, Be = 4, Ve = "aes-256-gcm", He = {
	originalName: "encrypted-text.txt",
	originalMime: "text/plain"
}, Ue = new TextEncoder(), We = new TextDecoder("utf-8", { fatal: !0 }), Y = Ue.encode(Ne), Ge = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function Ke(e) {
	if (!(e instanceof Uint8Array)) throw new J("INVALID_ARGUMENT", "Expected a Uint8Array.");
	if (typeof globalThis.btoa != "function") throw new J("CRYPTO_UNAVAILABLE", "This environment does not provide the browser base64 encoder.");
	let t = [], n = 32768;
	for (let r = 0; r < e.length; r += n) {
		let i = Math.min(r + n, e.length), a = "";
		for (let t = r; t < i; t += 1) a += String.fromCharCode(e[t]);
		t.push(a);
	}
	return globalThis.btoa(t.join(""));
}
function qe(e) {
	if (typeof e != "string" || e.length % 4 != 0 || !Ge.test(e)) throw new J("INVALID_BASE64", "Value is not valid standard base64.");
	if (typeof globalThis.atob != "function") throw new J("CRYPTO_UNAVAILABLE", "This environment does not provide the browser base64 decoder.");
	let t;
	try {
		t = globalThis.atob(e);
	} catch (e) {
		throw new J("INVALID_BASE64", "Value is not valid standard base64.", { cause: e });
	}
	let n = new Uint8Array(t.length);
	for (let e = 0; e < t.length; e += 1) n[e] = t.charCodeAt(e);
	return n;
}
async function Je(e, t, n = Ve) {
	if (typeof e != "string") throw new J("INVALID_ARGUMENT", "Plaintext must be a string.");
	return `${Pe}${Ke(await Xe(Ue.encode(e), t, He, n))}`;
}
async function Ye(e, t) {
	if (typeof e != "string") throw new J("INVALID_ARGUMENT", "Encrypted payload must be a string.");
	let n = e.trim(), r = n.startsWith("GVDV1:") ? n.slice(6) : n, i;
	try {
		i = qe(r);
	} catch (e) {
		throw e instanceof J && e.code === "CRYPTO_UNAVAILABLE" ? e : new J("INVALID_PACKAGE", "Text is not a Drive Vault encrypted payload.", { cause: e });
	}
	let a = await Ze(i, t);
	try {
		return We.decode(a.bytes);
	} catch (e) {
		throw new J("INVALID_TEXT", "Decrypted payload is not valid UTF-8 text.", { cause: e });
	}
}
async function Xe(e, t, n, r = Ve) {
	ct(e), st(t), lt(n), ut(r);
	let i = at(Le), a = at(Re), o = await et(t, i), s;
	try {
		s = await tt(e, o, a, r);
	} finally {
		o.fill(0);
	}
	let c = {
		version: 1,
		algorithm: r,
		kdf: Fe,
		salt_b64: Ke(i),
		nonce_b64: Ke(a),
		original_name: n.originalName,
		original_mime: n.originalMime
	}, l = Ue.encode(JSON.stringify(c));
	if (l.length > 4294967295) throw new J("INVALID_ARGUMENT", "Vault header is too large.");
	let u = new Uint8Array(Y.length + Be + l.length + s.length);
	return u.set(Y, 0), new DataView(u.buffer).setUint32(Y.length, l.length, !1), u.set(l, Y.length + Be), u.set(s, Y.length + Be + l.length), u;
}
async function Ze(e, t) {
	ct(e), st(t);
	let n = Qe(e), r = ot(n.header.salt_b64, "salt"), i = ot(n.header.nonce_b64, "nonce"), a = await et(t, r), o;
	try {
		o = await nt(n.ciphertext, a, i, n.header.algorithm);
	} finally {
		a.fill(0);
	}
	return {
		bytes: o,
		header: n.header,
		metadata: {
			originalName: n.header.original_name,
			originalMime: n.header.original_mime
		}
	};
}
function Qe(e) {
	ct(e);
	let t = Y.length, n = t + Be;
	if (e.length < n || !dt(e, Y)) throw X();
	let r = new DataView(e.buffer, e.byteOffset + t, Be).getUint32(0, !1), i = n + r;
	if (r === 0 || i > e.length) throw X();
	let a;
	try {
		a = JSON.parse(We.decode(e.subarray(n, i)));
	} catch (e) {
		throw X(e);
	}
	let o = $e(a), s = ot(o.salt_b64, "salt"), c = ot(o.nonce_b64, "nonce");
	if (s.length !== Le || c.length !== Re) throw X();
	let l = e.slice(i);
	if (l.length < ze) throw X();
	return {
		header: o,
		ciphertext: l
	};
}
function $e(e) {
	if (!pt(e)) throw X();
	if (e.version !== 1) throw new J("UNSUPPORTED_VERSION", "Unsupported vault package version.");
	if (e.algorithm !== "aes-256-gcm" && e.algorithm !== "chacha20-poly1305") throw new J("UNSUPPORTED_ALGORITHM", `Unsupported vault algorithm: ${String(e.algorithm)}.`);
	if (e.kdf !== "argon2id-default") throw new J("UNSUPPORTED_KDF", `Unsupported vault KDF: ${String(e.kdf)}.`);
	if (typeof e.salt_b64 != "string" || typeof e.nonce_b64 != "string" || typeof e.original_name != "string" || typeof e.original_mime != "string") throw X();
	return {
		version: 1,
		algorithm: e.algorithm,
		kdf: Fe,
		salt_b64: e.salt_b64,
		nonce_b64: e.nonce_b64,
		original_name: e.original_name,
		original_mime: e.original_mime
	};
}
async function et(e, t) {
	try {
		let n = await Me({
			password: Ue.encode(e),
			salt: t,
			parallelism: Ie.parallelism,
			iterations: Ie.iterations,
			memorySize: Ie.memorySizeKiB,
			hashLength: Ie.keyLength,
			outputType: "binary"
		});
		if (!(n instanceof Uint8Array) || n.length !== Ie.keyLength) throw Error("Argon2id returned an invalid key.");
		return n;
	} catch (e) {
		throw new J("KEY_DERIVATION_FAILED", "Could not derive the Drive Vault encryption key with Argon2id v=19, m=19456, t=2, p=1.", { cause: e });
	}
}
async function tt(e, t, n, r) {
	try {
		if (r === "aes-256-gcm") {
			let r = it(), i = await r.subtle.importKey("raw", ft(t), { name: "AES-GCM" }, !1, ["encrypt"]), a = await r.subtle.encrypt({
				name: "AES-GCM",
				iv: ft(n),
				tagLength: 128
			}, i, ft(e));
			return new Uint8Array(a);
		}
		return rt()(t, n).encrypt(e);
	} catch (e) {
		throw e instanceof J ? e : new J("ENCRYPTION_FAILED", "Drive Vault encryption failed.", { cause: e });
	}
}
async function nt(e, t, n, r) {
	try {
		if (r === "aes-256-gcm") {
			let r = it(), i = await r.subtle.importKey("raw", ft(t), { name: "AES-GCM" }, !1, ["decrypt"]), a = await r.subtle.decrypt({
				name: "AES-GCM",
				iv: ft(n),
				tagLength: 128
			}, i, ft(e));
			return new Uint8Array(a);
		}
		return rt()(t, n).decrypt(e);
	} catch (e) {
		throw e instanceof J ? e : new J("DECRYPTION_FAILED", "Decryption failed. Check the password and encrypted payload.", { cause: e });
	}
}
function rt() {
	if (typeof H != "function") throw new J("UNSUPPORTED_ALGORITHM", "ChaCha20-Poly1305 is unavailable. Install a compatible @noble/ciphers build; the package can still be parsed without decrypting it.");
	return H;
}
function it() {
	if (!globalThis.crypto?.subtle || typeof globalThis.crypto.getRandomValues != "function") throw new J("CRYPTO_UNAVAILABLE", "WebCrypto is unavailable; AES-256-GCM requires a secure Chromium extension context.");
	return globalThis.crypto;
}
function at(e) {
	let t = new Uint8Array(e);
	return it().getRandomValues(t), t;
}
function ot(e, t) {
	try {
		return qe(e);
	} catch (e) {
		throw e instanceof J && e.code === "CRYPTO_UNAVAILABLE" ? e : new J("INVALID_PACKAGE", `Vault header contains invalid ${t} base64.`, { cause: e });
	}
}
function st(e) {
	if (typeof e != "string" || e.length === 0) throw new J("INVALID_ARGUMENT", "Password is required.");
}
function ct(e) {
	if (!(e instanceof Uint8Array)) throw new J("INVALID_ARGUMENT", "Expected a Uint8Array.");
}
function lt(e) {
	if (!e || typeof e.originalName != "string" || typeof e.originalMime != "string") throw new J("INVALID_ARGUMENT", "Metadata must contain originalName and originalMime strings.");
}
function ut(e) {
	if (e !== "aes-256-gcm" && e !== "chacha20-poly1305") throw new J("UNSUPPORTED_ALGORITHM", `Unsupported vault algorithm: ${e}.`);
}
function dt(e, t) {
	if (e.length < t.length) return !1;
	for (let n = 0; n < t.length; n += 1) if (e[n] !== t[n]) return !1;
	return !0;
}
function ft(e) {
	return Uint8Array.from(e).buffer;
}
function pt(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function X(e) {
	return new J("INVALID_PACKAGE", "Invalid vault package.", { cause: e });
}
//#endregion
//#region src/shared/protocol.ts
var mt = "driveVaultReadItem", ht = "driveVaultPanelContext", gt = /* @__PURE__ */ new Set(["https://mail.google.com", "https://calendar.google.com"]);
function _t(e) {
	if (!e) return [];
	let t = [];
	return e.personal && t.push({
		id: "personal",
		name: "Personal",
		kind: "personal"
	}), t.push(...e.shared.map(({ id: e, name: t }) => ({
		id: e,
		name: t,
		kind: "shared"
	}))), t;
}
function vt(e) {
	return {
		personal: e.personal.trim(),
		shared: e.shared.map((e) => ({
			id: e.id || crypto.randomUUID(),
			name: e.name.trim(),
			password: e.password
		})).filter((e) => e.name && e.password)
	};
}
//#endregion
//#region src/background/index.ts
var yt = "driveVaultSession", Z = "storedVault", bt = "enabledSites", xt = "autoLockMinutes", St = "drive-vault-auto-lock", Ct = Promise.resolve();
function Q(e) {
	throw Error(e);
}
async function wt() {
	let e = await chrome.storage.local.get(Z);
	return typeof e[Z] == "string" ? e[Z] : null;
}
function Tt(e) {
	return typeof e == "number" && Number.isInteger(e) && e >= 1 && e <= 59;
}
function Et(e) {
	return Tt(e) || Q("Auto-lock must be a whole number from 1 to 59 minutes"), e;
}
async function Dt() {
	let e = (await chrome.storage.local.get(xt))[xt];
	return Tt(e) ? e : 5;
}
async function Ot(e) {
	let t = Et(e);
	return await chrome.storage.local.set({ [xt]: t }), t;
}
async function kt() {
	let e = (await chrome.storage.session.get(yt))[yt];
	return e ? e.expiresAt <= Date.now() ? (await Nt(), null) : Tt(e.autoLockMinutes) ? e : {
		...e,
		autoLockMinutes: await Dt()
	} : null;
}
async function At(e, t, n, r) {
	let i = r === void 0 ? await Dt() : Et(r), a = {
		vault: vt(e),
		storageMode: t,
		expiresAt: Date.now() + i * 60 * 1e3,
		autoLockMinutes: i,
		...n ? { masterPassword: n } : {}
	};
	return await chrome.storage.session.set({ [yt]: a }), await chrome.alarms.create(St, { when: a.expiresAt }), a;
}
async function jt(e) {
	return At(e.vault, e.storageMode, e.masterPassword, e.autoLockMinutes);
}
async function Mt(e = !1) {
	let t = await kt();
	return t || Q("Drive Vault is locked"), e ? jt(t) : t;
}
async function Nt() {
	await chrome.storage.session.remove([yt, mt]), await chrome.alarms.clear(St);
}
function Pt(e) {
	(!e || typeof e != "object") && Q("Invalid vault data");
	let t = e;
	(typeof t.personal != "string" || !Array.isArray(t.shared)) && Q("Invalid vault data");
	for (let e of t.shared) (!e || typeof e.id != "string" || typeof e.name != "string" || typeof e.password != "string") && Q("Invalid shared password entry");
	return vt(t);
}
async function $() {
	let [e, t, n] = await Promise.all([
		kt(),
		wt(),
		Dt()
	]);
	return {
		configured: !!(t || e),
		locked: !e,
		storageMode: e?.storageMode ?? (t ? "stored" : "none"),
		expiresAt: e?.expiresAt ?? null,
		autoLockMinutes: e?.autoLockMinutes ?? n,
		keys: _t(e?.vault ?? null)
	};
}
function Ft(e, t) {
	if (t === "personal") return e.personal || Q("The personal password is not configured"), e.personal;
	let n = e.shared.find((e) => e.id === t);
	return n || Q("That shared password is no longer available"), n.password;
}
async function It(e, t) {
	let n = await Mt(!1), r = [...n.vault.personal ? [{
		id: "personal",
		name: "Personal",
		kind: "personal",
		password: n.vault.personal
	}] : [], ...n.vault.shared.map((e) => ({
		...e,
		kind: "shared"
	}))], i = t ? r.filter((e) => e.id === t) : r;
	i.length || Q("That decryption key is no longer available");
	for (let t of i) try {
		return {
			text: await Ye(e, t.password),
			keyId: t.id,
			keyName: t.name,
			kind: t.kind
		};
	} catch {}
	Q(t ? "The selected Drive Vault key could not decrypt this payload" : "No active Drive Vault password could decrypt this payload");
}
function Lt(e, t) {
	let n = Ct.then(() => It(e, t));
	return Ct = n.then(() => void 0, () => void 0), n;
}
function Rt(e, t) {
	if (t.tab?.id) return t.tab.id;
	let n = Number(e.tabId);
	return Number.isInteger(n) && n > 0 ? n : null;
}
async function zt(e) {
	let t = chrome.sidePanel.setOptions({
		tabId: e,
		path: "sidepanel.html",
		enabled: !0
	}), n = chrome.sidePanel.open({ tabId: e });
	await Promise.all([t, n]);
}
async function Bt() {
	return (await chrome.storage.session.get("driveVaultReadItem")).driveVaultReadItem ?? null;
}
function Vt(e) {
	try {
		let t = new URL(e ?? "").hostname;
		if (t === "mail.google.com") return "gmail";
		if (t === "calendar.google.com") return "calendar";
	} catch {}
	return "other";
}
function Ht(e) {
	return e === "gmail" ? "compose" : e === "calendar" ? "calendar" : "files";
}
async function Ut(e, t, n) {
	let r = {
		tabId: e,
		route: t,
		site: n,
		updatedAt: Date.now()
	};
	return await chrome.storage.session.set({ [ht]: r }), r;
}
async function Wt() {
	return (await chrome.storage.session.get("driveVaultPanelContext")).driveVaultPanelContext ?? null;
}
async function Gt(e) {
	let t = e.requestedKeyId && e.requestedKeyId !== "auto" ? e.requestedKeyId : void 0;
	try {
		let n = await Lt(e.payload, t), r = {
			...e,
			status: "ready",
			text: n.text,
			keyId: n.keyId,
			keyName: n.keyName,
			kind: n.kind,
			requestedKeyId: e.requestedKeyId ?? "auto",
			error: void 0
		};
		return await chrome.storage.session.set({ [mt]: r }), r;
	} catch (t) {
		let n = {
			...e,
			status: "error",
			text: void 0,
			keyId: void 0,
			keyName: void 0,
			kind: void 0,
			error: t instanceof Error ? t.message : "This message could not be decrypted"
		};
		return await chrome.storage.session.set({ [mt]: n }), n;
	}
}
function Kt(e) {
	let t = new URL(e);
	return t.protocol !== "https:" && t.protocol !== "http:" && Q("Drive Vault can only be enabled on web pages"), {
		origin: t.origin,
		pattern: `${t.origin}/*`
	};
}
function qt(e) {
	let t = 2166136261;
	for (let n = 0; n < e.length; n += 1) t ^= e.charCodeAt(n), t = Math.imul(t, 16777619);
	return `drive-vault-${(t >>> 0).toString(16)}`;
}
async function Jt() {
	let e = await chrome.storage.local.get(bt);
	return Array.isArray(e[bt]) ? e[bt] : [];
}
async function Yt(e) {
	let t = qt(e);
	(await chrome.scripting.getRegisteredContentScripts({ ids: [t] })).length || await chrome.scripting.registerContentScripts([{
		id: t,
		matches: [`${e}/*`],
		js: ["content.js"],
		runAt: "document_idle",
		persistAcrossSessions: !0
	}]);
}
async function Xt() {
	let e = await Jt();
	await Promise.all(e.map(async (e) => {
		try {
			await chrome.permissions.contains({ origins: [`${e}/*`] }) && await Yt(e);
		} catch {}
	}));
}
async function Zt() {
	let [e] = await chrome.tabs.query({
		active: !0,
		currentWindow: !0
	});
	return e?.id || Q("No active browser tab is available"), e;
}
async function Qt(e) {
	let t = await Zt(), { origin: n, pattern: r } = Kt(e ?? t?.url ?? "");
	if (gt.has(n)) return {
		origin: n,
		enabled: !0,
		builtIn: !0
	};
	let i = await chrome.permissions.contains({ origins: [r] });
	i ||= await chrome.permissions.request({ origins: [r] }), i || Q("Site access was not granted");
	let a = new Set(await Jt());
	if (a.add(n), await chrome.storage.local.set({ [bt]: [...a].sort() }), await Yt(n), t?.id && t.url && new URL(t.url).origin === n) try {
		await chrome.scripting.executeScript({
			target: { tabId: t.id },
			files: ["content.js"]
		});
	} catch {}
	return {
		origin: n,
		enabled: !0,
		builtIn: !1
	};
}
async function $t(e) {
	let t = e ? null : await Zt(), { origin: n, pattern: r } = Kt(e ?? t?.url ?? "");
	gt.has(n) && Q("Gmail and Google Calendar access is built in");
	let i = new Set(await Jt());
	i.delete(n), await chrome.storage.local.set({ [bt]: [...i].sort() });
	let a = qt(n);
	return (await chrome.scripting.getRegisteredContentScripts({ ids: [a] })).length && await chrome.scripting.unregisterContentScripts({ ids: [a] }), await chrome.permissions.remove({ origins: [r] }), {
		origin: n,
		enabled: !1,
		builtIn: !1
	};
}
async function en(e) {
	let t = e ? null : await Zt(), { origin: n, pattern: r } = Kt(e ?? t?.url ?? ""), i = gt.has(n);
	return {
		origin: n,
		enabled: i || await chrome.permissions.contains({ origins: [r] }),
		builtIn: i
	};
}
async function tn(e, t) {
	switch (e.type) {
		case "VAULT_STATUS":
		case "GET_VAULT_STATUS": return $();
		case "SET_SESSION_VAULT": {
			let t = Pt(e.vault), n = e.autoLockMinutes === void 0 ? await Dt() : await Ot(e.autoLockMinutes);
			return await chrome.storage.local.remove(Z), await At(t, "session", void 0, n), $();
		}
		case "CREATE_STORED_VAULT": {
			let t = Pt(e.vault), n = String(e.masterPassword ?? "");
			n || Q("A master password is required");
			let r = e.autoLockMinutes === void 0 ? await Dt() : Et(e.autoLockMinutes), i = await Je(JSON.stringify(t), n, "aes-256-gcm");
			return await chrome.storage.local.set({
				[Z]: i,
				[xt]: r
			}), await At(t, "stored", n, r), $();
		}
		case "UNLOCK_VAULT": {
			let t = String(e.masterPassword ?? ""), n = await wt();
			n || Q("No stored password vault exists"), t || Q("Enter the master password");
			let r = await Ye(n, t);
			return await At(Pt(JSON.parse(r)), "stored", t), $();
		}
		case "SET_AUTO_LOCK_MINUTES": {
			let t = await Ot(e.autoLockMinutes), n = await kt();
			return n && await At(n.vault, n.storageMode, n.masterPassword, t), $();
		}
		case "UPDATE_VAULT": {
			let t = await Mt(!1), n;
			if (e.vault) n = Pt(e.vault);
			else switch (n = {
				personal: t.vault.personal,
				shared: t.vault.shared.map((e) => ({ ...e }))
			}, e.action) {
				case "set-personal": {
					let t = String(e.password ?? "");
					t || Q("Enter a personal password"), n.personal = t;
					break;
				}
				case "upsert-shared": {
					let t = e.shared;
					(!t || typeof t.name != "string" || typeof t.password != "string") && Q("A shared profile needs a name and password");
					let r = {
						id: typeof t.id == "string" && t.id ? t.id : crypto.randomUUID(),
						name: t.name.trim(),
						password: t.password
					};
					(!r.name || !r.password) && Q("A shared profile needs a name and password");
					let i = n.shared.findIndex((e) => e.id === r.id);
					i >= 0 ? n.shared[i] = r : n.shared.push(r);
					break;
				}
				case "remove-shared":
					n.shared = n.shared.filter((t) => t.id !== String(e.id ?? ""));
					break;
				default: Q("Unknown password-vault update");
			}
			if (n = vt(n), t.storageMode === "stored") {
				let r = String(e.masterPassword ?? t.masterPassword ?? "");
				r || Q("Unlock the stored vault again before changing it");
				let i = await Je(JSON.stringify(n), r, "aes-256-gcm");
				await chrome.storage.local.set({ [Z]: i }), await At(n, "stored", r, t.autoLockMinutes);
			} else await At(n, "session", void 0, t.autoLockMinutes);
			return $();
		}
		case "LOCK_VAULT": return await Nt(), $();
		case "DELETE_STORED_VAULT": return await Nt(), await chrome.storage.local.remove(Z), $();
		case "LIST_KEYS": return _t((await Mt(!1)).vault);
		case "ENCRYPT_TEXT": {
			let t = await Mt(!0), n = String(e.text ?? "");
			n || Q("Enter text to encrypt");
			let r = String(e.keyId ?? "personal"), i = e.algorithm ?? "aes-256-gcm";
			return { ciphertext: await Je(n, Ft(t.vault, r), i) };
		}
		case "DECRYPT_TEXT": {
			let t = typeof e.keyId == "string" && e.keyId && e.keyId !== "auto" ? e.keyId : void 0;
			return Lt(String(e.payload ?? e.ciphertext ?? ""), t);
		}
		case "GET_READ_ITEM": return Bt();
		case "GET_PANEL_CONTEXT": return Wt();
		case "GET_ACTIVE_SITE": {
			let e = await Zt(), t = Vt(e.url);
			return {
				tabId: e.id,
				site: t,
				route: Ht(t),
				url: e.url ?? ""
			};
		}
		case "CLEAR_READ_ITEM": return await chrome.storage.session.remove(mt), { cleared: !0 };
		case "RETRY_READ_ITEM": {
			let t = await Bt();
			t || Q("No encrypted message is selected");
			let n = typeof e.keyId == "string" && e.keyId ? e.keyId : "auto", r = {
				...t,
				status: "decrypting",
				text: void 0,
				keyId: void 0,
				keyName: void 0,
				kind: void 0,
				requestedKeyId: n,
				error: void 0
			};
			return await chrome.storage.session.set({ [mt]: r }), Gt(r);
		}
		case "OPEN_DECRYPT_IN_SIDE_PANEL": {
			let n = Rt(e, t);
			n || Q("No source tab is available for the side panel");
			let r = String(e.payload ?? "").trim();
			r.startsWith("GVDV1:") || Q("No Drive Vault payload was provided");
			let i = {
				id: crypto.randomUUID(),
				status: "decrypting",
				payload: r,
				sourceUrl: String(e.sourceUrl ?? t.url ?? ""),
				requestedAt: Date.now(),
				requestedKeyId: "auto"
			}, a = {
				tabId: n,
				route: "read",
				site: Vt(String(e.sourceUrl ?? t.url ?? "")),
				updatedAt: Date.now()
			}, o = chrome.storage.session.set({
				[mt]: i,
				[ht]: a
			}), s = zt(n);
			return await Promise.all([o, s]), Gt(i);
		}
		case "ENCRYPT_FILE": {
			let t = await Mt(!0), n = String(e.keyId ?? "personal"), r = String(e.name ?? "encrypted-file"), i = String(e.mime ?? "application/octet-stream");
			return {
				dataBase64: Ke(await Xe(qe(String(e.dataBase64 ?? "")), Ft(t.vault, n), {
					originalName: r,
					originalMime: i
				}, e.algorithm ?? "aes-256-gcm")),
				name: `${r}.gvdv`,
				mime: "application/octet-stream"
			};
		}
		case "DECRYPT_FILE": {
			let t = await Mt(!0), n = String(e.keyId ?? "personal"), r = await Ze(qe(String(e.dataBase64 ?? "")), Ft(t.vault, n));
			return {
				dataBase64: Ke(r.bytes),
				name: r.header.original_name || "decrypted-file",
				mime: r.header.original_mime || "application/octet-stream"
			};
		}
		case "OPEN_SIDE_PANEL": {
			let n = Rt(e, t) ?? (await Zt()).id;
			n || Q("No active browser tab is available");
			let r = String(e.target ?? e.site ?? ""), i = r === "gmail" || r === "calendar" ? r : null, a = zt(n), o = (async () => {
				let e = i ?? Vt((await chrome.tabs.get(n)).url);
				return Ut(n, Ht(e), e);
			})();
			return await Promise.all([a, o]), { opened: !0 };
		}
		case "INSERT_IN_ACTIVE_TAB": {
			let t = await Zt(), n = await chrome.tabs.sendMessage(t.id, {
				type: "INSERT_CIPHERTEXT",
				target: e.target,
				ciphertext: e.ciphertext,
				fields: e.fields
			});
			return n && typeof n == "object" && n.ok === !1 && Q(typeof n.error == "string" ? n.error : "The page rejected the ciphertext"), n ?? { inserted: !0 };
		}
		case "ENABLE_CURRENT_SITE": return Qt(typeof e.url == "string" ? e.url : void 0);
		case "DISABLE_CURRENT_SITE": return $t(typeof e.url == "string" ? e.url : void 0);
		case "CURRENT_SITE_STATUS":
		case "GET_CURRENT_SITE_STATUS": return en(typeof e.url == "string" ? e.url : void 0);
		default: Q(`Unknown Drive Vault request: ${e.type}`);
	}
}
chrome.runtime.onMessage.addListener((e, t, n) => (tn(e, t).then((e) => n({
	ok: !0,
	data: e
})).catch((e) => n({
	ok: !1,
	error: e instanceof Error ? e.message : "Drive Vault request failed"
})), !0)), chrome.alarms.onAlarm.addListener((e) => {
	e.name === St && Nt();
}), chrome.runtime.onInstalled.addListener(() => {
	Xt();
}), chrome.runtime.onStartup.addListener(() => {
	Xt();
}), Xt();
//#endregion
