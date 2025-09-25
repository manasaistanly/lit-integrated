const validateRequest = (schema, source = 'body') => {
  return (req, res, next) => {
    const { error } = schema.validate(req[source], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));
      
      return res.status(400).json({
        success: false,
        errors
      });
    }

    next();
  };
};

module.exports = { validateRequest };