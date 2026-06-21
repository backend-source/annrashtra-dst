import * as leadsService from '../services/leads.service.js';

export async function create(req, res, next) {
  try {
    const lead = await leadsService.captureManualLead(req.body);
    res.status(201).json(lead);
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const leads = await leadsService.listLeads(req.user);
    res.json(leads);
  } catch (err) {
    next(err);
  }
}
