import * as authService from '../services/auth.service.js';

export async function login(req, res, next) {
  try {
    res.json(await authService.login(req.body.mobile));
  } catch (err) {
    next(err);
  }
}

export async function requestOtp(req, res, next) {
  try {
    res.json(await authService.requestLoginOtp(req.body.mobile));
  } catch (err) {
    next(err);
  }
}

export async function verifyOtp(req, res, next) {
  try {
    res.json(await authService.verifyLoginOtp(req.body.mobile, req.body.code));
  } catch (err) {
    next(err);
  }
}
