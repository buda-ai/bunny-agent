import { describe, expect, it } from "vitest";
import { parseMultipart } from "../multipart.js";

describe("parseMultipart", () => {
  it("parses fields and files with an unquoted boundary", () => {
    const body = Buffer.from(
      [
        "--bunny",
        'Content-Disposition: form-data; name="title"',
        "",
        "Quarterly report",
        "--bunny",
        'Content-Disposition: form-data; name="upload"; filename="report.txt"',
        "Content-Type: text/plain",
        "",
        "hello file",
        "--bunny--",
        "",
      ].join("\r\n"),
    );

    const result = parseMultipart("multipart/form-data; boundary=bunny", body);

    expect(result.fields).toEqual({ title: "Quarterly report" });
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toEqual({
      filename: "report.txt",
      data: Buffer.from("hello file"),
    });
  });

  it("parses a quoted boundary and skips malformed parts", () => {
    const body = Buffer.from(
      [
        "--quoted",
        "Content-Disposition: form-data",
        "missing header terminator",
        "--quoted",
        'Content-Disposition: form-data; name="note"',
        "",
        "ok",
        "--quoted--",
        "",
      ].join("\r\n"),
    );

    const result = parseMultipart(
      'multipart/form-data; boundary="quoted"',
      body,
    );

    expect(result).toEqual({
      fields: { note: "ok" },
      files: [],
    });
  });

  it("throws when the content type has no boundary", () => {
    expect(() =>
      parseMultipart("multipart/form-data", Buffer.from("")),
    ).toThrow("missing multipart boundary");
  });
});
