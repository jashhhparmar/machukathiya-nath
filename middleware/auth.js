module.exports.requireLogin = (req, res, next) => {
  if (!req.session.userId) {
    req.session.errorMessage = 'Please log in to access this page.';
    return res.redirect('/login');
  }
  next();
};
