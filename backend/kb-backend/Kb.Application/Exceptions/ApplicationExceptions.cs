namespace Kb.Application.Exceptions;

public abstract class ApplicationExceptionBase(string message, Exception? innerException = null) : Exception(message, innerException);

public sealed class NotFoundException(string message = "The requested resource was not found.") : ApplicationExceptionBase(message);
public sealed class ForbiddenException(string message = "You do not have permission to perform this action.") : ApplicationExceptionBase(message);
public sealed class ConflictException(string message = "The requested operation conflicts with the current state.") : ApplicationExceptionBase(message);
public sealed class ConcurrencyConflictException(string message = "The resource was changed by another request.") : ApplicationExceptionBase(message);
public sealed class BusinessRuleException(string message = "The request violates a business rule.") : ApplicationExceptionBase(message);
public sealed class ExternalServiceException(string message = "A required service is temporarily unavailable.", Exception? innerException = null) : ApplicationExceptionBase(message, innerException);
