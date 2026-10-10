import assert from "node:assert/strict";
import {test} from "node:test";
import {makeSupportConfig, validatePixCode, validateSupportUrl} from "../lib/support-config.ts";

// Official BCB BR Code example, never configured as a real payment destination.
const example = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D";

test("support stays hidden until an actual configured payment method validates", () => {
  assert.equal(makeSupportConfig(), null);
  assert.equal(makeSupportConfig("bad", "javascript:alert(1)"), null);
  assert.deepEqual(makeSupportConfig(undefined, "https://ko-fi.com/example"), {pixCode:null, internationalUrl:"https://ko-fi.com/example"});
});
test("Pix retains exact bank payload and rejects damaged copy-paste values", () => {
  assert.equal(validatePixCode(example), example);
  assert.equal(validatePixCode(` ${example} `), example);
  assert.equal(validatePixCode(example.replace("Fulano", "Belano")), null);
  assert.equal(validatePixCode(example.slice(0, -1)), null);
  assert.equal(validatePixCode(example + "0000"), null);
  assert.equal(validatePixCode(example.replace("5303986", "5303840")), null);
  assert.equal(validatePixCode(example.replace("br.gov.bcb.pix", "br.gov.fake.xx")), null);
});
test("international destinations require exact payment-provider HTTPS domains", () => {
  for (const url of ["https://ko-fi.com/example", "https://paypal.me/example", "https://www.paypal.com/donate/?hosted_button_id=EXAMPLE", "https://buy.stripe.com/example"]) assert.equal(validateSupportUrl(url), url);
  for (const url of ["http://ko-fi.com/example", "javascript:alert(1)", "https://ko-fi.com.evil.test/example", "https://user:password@ko-fi.com/example", "https://ko-fi.com:444/example", "https://ko-fi.com/", "https://www.paypal.com/signin", "https://example.com/pay"]) assert.equal(validateSupportUrl(url), null);
});
