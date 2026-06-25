import * as service from '../services/users.service.js';

// List users, optionally by ?role= (e.g. promoter) — for admin/supervisor screens.
export async function list(req, res, next) {
  try {
    res.json(await service.list(req.query.role));
  } catch (err) {
    next(err);
  }
}

// Admin creates a promoter or supervisor (name, mobile, role, optional emp_code/supervisor).
export async function create(req, res, next) {
  try {
    res.status(201).json(await service.createUser(req.body));
  } catch (err) {
    next(err);
  }
}

// Admin activates/deactivates a team member (deactivate = block login, keep history).
export async function setStatus(req, res, next) {
  try {
    res.json(await service.setStatus(req.params.id, req.body.status));
  } catch (err) {
    next(err);
  }
}

// Admin hard-deletes a team member (only allowed if they have no activity).
export async function remove(req, res, next) {
  try {
    res.json(await service.remove(req.params.id));
  } catch (err) {
    next(err);
  }
}
