/** Lỗi trả thẳng cho người dùng; `message` bằng tiếng Việt. */
export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public screenshot?: string,
  ) {
    super(message);
  }
}

/** Phiên đăng nhập Alobo đã lưu không còn dùng được (trang tóm tắt vẫn đòi đăng nhập). */
export class SessionExpiredError extends HttpError {
  constructor() {
    super('Phiên đăng nhập Alobo đã hết hạn, hãy đăng nhập lại', 401);
  }
}
