
using MySqlConnector;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Diagnostics;
using HandWorkApi.Middlewares;
using HandWorkApi.Extensions;

// ===================================
// BUILDER
// ===================================

var builder = WebApplication.CreateBuilder(args);

// ===================================
// JWT CONFIGURATION
// ===================================

var jwtKey = builder.Configuration["Jwt:Key"]
    ?? throw new InvalidOperationException("JWT Key is missing.");

var jwtIssuer = builder.Configuration["Jwt:Issuer"]
    ?? throw new InvalidOperationException("JWT Issuer is missing.");

var jwtAudience = builder.Configuration["Jwt:Audience"]
    ?? throw new InvalidOperationException("JWT Audience is missing.");

var expirationMinutes = int.TryParse(
    builder.Configuration["Jwt:ExpirationMinutes"],
    out var minutes
) ? minutes : 60;

if (Encoding.UTF8.GetByteCount(jwtKey) < 32)
{
    throw new InvalidOperationException(
        "JWT Key must contain at least 32 bytes."
    );
}

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,

            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,

            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtKey)
            ),

            NameClaimType = ClaimTypes.Name,
            RoleClaimType = ClaimTypes.Role,

            ClockSkew = TimeSpan.Zero
        };
         options.ConfigureJwtErrorHandling();
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy =>
    {
        policy.RequireAuthenticatedUser();
        policy.RequireRole("Admin");
    });
    options.AddPolicy("ClientOnly", policy =>
    {
        policy.RequireAuthenticatedUser();
        policy.RequireRole("Client");
    });
});

// ===================================
// DATABASE CONNECTION
// ===================================

Database.ConnectionString =
    builder.Configuration.GetConnectionString("DefaultConnection")
    ?? throw new InvalidOperationException(
        "Database connection string is missing."
    );

builder.Services.AddScoped<MySqlConnection>(
    _ => Database.CreateConnection()
);

// ===================================
// SWAGGER + JWT AUTHORIZE
// ===================================

builder.Services.AddEndpointsApiExplorer();

builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Hand Work API",
        Version = "v1",
        Description = "API for Hand Work application"
    });

    options.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Paste your JWT token here."
    });

    options.AddSecurityRequirement(document =>
        new OpenApiSecurityRequirement
        {
            [new OpenApiSecuritySchemeReference("Bearer", document)] = []
        });
});

// ===================================
// CORS
// ===================================

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:5173",
                "http://127.0.0.1:5173"
            )
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

// ===================================
// BUILD APPLICATION
// ===================================

var app = builder.Build();
app.UseStaticFiles();
app.UseMiddleware<GlobalExceptionMiddleware>();
app.UseStatusCodeHandling();
// ===================================
// INITIALIZE DATABASE
// ===================================

await Database.InitializeAsync();


// ===================================
// MIDDLEWARE
// ===================================

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

// ===================================
// HOME
// ===================================
// Temporary endpoint to test Error Handling

app.MapGet("/", () =>
{
    return Results.Ok(new
    {
        message = "Hand Work API is running!"
    });
});

// ===================================
// TEST DATABASE
// ===================================

app.MapGet("/api/test-db", async (MySqlConnection db) =>
{
    await db.OpenAsync();

    await using var command = new MySqlCommand(
        "SELECT DATABASE()",
        db
    );

    var databaseName = await command.ExecuteScalarAsync();

    return Results.Ok(new
    {
        message = "Database connected successfully!",
        database = databaseName
    });
});

// ===================================
// AUTHENTICATION - REGISTER
// ===================================

app.MapPost("/api/auth/register", async (
    RegisterRequest input,
    MySqlConnection db) =>
{
    // Required fields

    if (string.IsNullOrWhiteSpace(input.Name) ||
        string.IsNullOrWhiteSpace(input.Email) ||
        string.IsNullOrWhiteSpace(input.Phone) ||
        string.IsNullOrWhiteSpace(input.Password))
    {
        return Results.BadRequest(new
        {
            message = "Name, email, phone and password are required."
        });
    }

    // Normalize input

    string name = input.Name.Trim();
    string email = input.Email.Trim().ToLowerInvariant();
    string phone = input.Phone.Trim();
    string address = input.Address?.Trim() ?? "";

    // Name validation

    if (name.Length < 2 || name.Length > 100)
    {
        return Results.BadRequest(new
        {
            message = "Name must contain between 2 and 100 characters."
        });
    }

    // Email validation

    if (email.Length > 254 ||
        !IsValidEmail(email))
    {
        return Results.BadRequest(new
        {
            message = "Please enter a valid email address."
        });
    }

    // Phone validation

    if (!IsValidAlgerianPhone(phone))
    {
        return Results.BadRequest(new
        {
            message = "Please enter a valid Algerian mobile number (05, 06 or 07)."
        });
    }

    // Address validation

    if (address.Length > 250)
    {
        return Results.BadRequest(new
        {
            message = "Address must not exceed 250 characters."
        });
    }

    // Password validation

    if (input.Password.Length < 8 || input.Password.Length > 128)
    {
        return Results.BadRequest(new
        {
            message = "Password must contain between 8 and 128 characters."
        });
    }

    await db.OpenAsync();

    // Check email

    const string checkEmailSql = @"
        SELECT COUNT(*)
        FROM users
        WHERE Email = @email";

    await using (var checkEmailCommand =
        new MySqlCommand(checkEmailSql, db))
    {
        checkEmailCommand.Parameters.AddWithValue("@email", email);

        int emailExists = Convert.ToInt32(
            await checkEmailCommand.ExecuteScalarAsync()
        );

        if (emailExists > 0)
        {
            return Results.Conflict(new
            {
                message = "This email is already registered."
            });
        }
    }

    // Check phone

    const string checkPhoneSql = @"
        SELECT COUNT(*)
        FROM users
        WHERE Phone = @phone
        AND PasswordHash <> 'GUEST_NO_LOGIN'";

    await using (var checkPhoneCommand =
        new MySqlCommand(checkPhoneSql, db))
    {
        checkPhoneCommand.Parameters.AddWithValue("@phone", phone);

        int phoneExists = Convert.ToInt32(
            await checkPhoneCommand.ExecuteScalarAsync()
        );

        if (phoneExists > 0)
        {
            return Results.Conflict(new
            {
                message = "This phone number already has an account."
            });
        }
    }

    // Hash password

    var passwordHasher = new PasswordHasher<RegisterRequest>();

    string passwordHash = passwordHasher.HashPassword(
        input,
        input.Password
    );

    // Insert user

    const string insertSql = @"
        INSERT INTO users
        (
            FullName,
            Email,
            Phone,
            Address,
            PasswordHash,
            Role
        )
        VALUES
        (
            @name,
            @email,
            @phone,
            @address,
            @passwordHash,
            'Client'
        )";

    await using var insertCommand =
        new MySqlCommand(insertSql, db);

    insertCommand.Parameters.AddWithValue("@name", name);
    insertCommand.Parameters.AddWithValue("@email", email);
    insertCommand.Parameters.AddWithValue("@phone", phone);
    insertCommand.Parameters.AddWithValue("@address", address);
    insertCommand.Parameters.AddWithValue("@passwordHash", passwordHash);

    try
    {
        await insertCommand.ExecuteNonQueryAsync();

        int newId = Convert.ToInt32(insertCommand.LastInsertedId);

        return Results.Created(
            $"/api/clients/{newId}",
            new
            {
                id = newId,
                name,
                email,
                phone,
                address,
                role = "Client",
                message = "Account created successfully!"
            }
        );
    }
    catch (MySqlException ex) when (ex.Number == 1062)
    {
        return Results.Conflict(new
        {
            message = "This email or phone number is already registered."
        });
    }
});

// ===================================
// AUTHENTICATION - LOGIN
// ===================================

app.MapPost("/api/auth/login", async (
    LoginRequest input,
    MySqlConnection db) =>
{
    if (string.IsNullOrWhiteSpace(input.Phone) ||
        string.IsNullOrWhiteSpace(input.Password))
    {
        return Results.BadRequest(new
        {
            message = "Phone and password are required."
        });
    }

    string phone = input.Phone.Trim();

    if (!IsValidAlgerianPhone(phone))
    {
        return Results.BadRequest(new
        {
            message = "Please enter a valid Algerian mobile number."
        });
    }

    if (input.Password.Length > 128)
    {
        return Results.BadRequest(new
        {
            message = "Password is too long."
        });
    }

    await db.OpenAsync();

    const string sql = @"
        SELECT
            Id,
            FullName,
            Email,
            Phone,
            Address,
            PasswordHash,
            Role
        FROM users
        WHERE Phone = @phone
        AND PasswordHash <> 'GUEST_NO_LOGIN'
        ORDER BY Id DESC
        LIMIT 1";

    await using var command = new MySqlCommand(sql, db);

    command.Parameters.AddWithValue("@phone", phone);

    int id;
    string fullName;
    string email;
    string userPhone;
    string? address;
    string passwordHash;
    string role;

    await using (var reader = await command.ExecuteReaderAsync())
    {
        if (!await reader.ReadAsync())
        {
            return Results.Json(
                new
                {
                    message = "Invalid phone number or password."
                },
                statusCode: 401
            );
        }

        id = Convert.ToInt32(reader["Id"]);
        fullName = reader["FullName"].ToString()!;
        email = reader["Email"].ToString()!;
        userPhone = reader["Phone"].ToString()!;

        address = reader.IsDBNull(reader.GetOrdinal("Address"))
            ? null
            : reader["Address"].ToString();

        passwordHash = reader["PasswordHash"].ToString()!;
        role = reader["Role"].ToString()!;
    }

    // Verify password

    var passwordHasher = new PasswordHasher<LoginRequest>();

    var verificationResult = passwordHasher.VerifyHashedPassword(
        input,
        passwordHash,
        input.Password
    );

    if (verificationResult == PasswordVerificationResult.Failed)
    {
        return Results.Json(
            new
            {
                message = "Invalid phone number or password."
            },
            statusCode: 401
        );
    }

    // Create JWT claims

    var claims = new[]
    {
        new Claim(ClaimTypes.NameIdentifier, id.ToString()),
        new Claim(ClaimTypes.Name, fullName),
        new Claim(ClaimTypes.Email, email),
        new Claim(ClaimTypes.MobilePhone, userPhone),
        new Claim(ClaimTypes.Role, role)
    };

    var key = new SymmetricSecurityKey(
        Encoding.UTF8.GetBytes(jwtKey)
    );

    var credentials = new SigningCredentials(
        key,
        SecurityAlgorithms.HmacSha256
    );

    var token = new JwtSecurityToken(
        issuer: jwtIssuer,
        audience: jwtAudience,
        claims: claims,
        expires: DateTime.UtcNow.AddMinutes(expirationMinutes),
        signingCredentials: credentials
    );

    string tokenString = new JwtSecurityTokenHandler()
        .WriteToken(token);

    return Results.Ok(new
    {
        message = "Login successful!",
        token = tokenString,
        expiresAt = token.ValidTo,

        user = new
        {
            id,
            name = fullName,
            email,
            phone = userPhone,
            address,
            role
        }
    });
});

// ===================================
// PRODUCTS
// ===================================

// GET ALL PRODUCTS - PUBLIC

app.MapGet("/api/products", async (MySqlConnection db) =>
{
    await db.OpenAsync();

    var products = new List<Product>();

    const string sql = @"
        SELECT Id, Name, Category, Price, Image, Description
        FROM products
        ORDER BY Id";

    await using var command = new MySqlCommand(sql, db);
    await using var reader = await command.ExecuteReaderAsync();

    while (await reader.ReadAsync())
    {
        products.Add(new Product
        {
            Id = Convert.ToInt32(reader["Id"]),
            Name = reader["Name"].ToString()!,
            Category = reader["Category"].ToString()!,
            Price = Convert.ToDecimal(reader["Price"]),
            Image = reader["Image"]?.ToString() ?? "",
            Description = reader["Description"]?.ToString() ?? ""
        });
    }

    return Results.Ok(products);
});

// GET ONE PRODUCT - PUBLIC

app.MapGet("/api/products/{id:int}", async (
    int id,
    MySqlConnection db) =>
{
    if (id <= 0)
    {
        return Results.BadRequest(new
        {
            message = "Product ID must be greater than zero."
        });
    }

    await db.OpenAsync();

    var product = await GetProductAsync(db, id);

    return product == null
        ? Results.NotFound(new { message = "Product not found." })
        : Results.Ok(product);
});

// ADD PRODUCT - ADMIN ONLY

app.MapPost("/api/products", async (
    ProductInput input,
    MySqlConnection db) =>
{
    string name = input.Name?.Trim() ?? "";
    string category = input.Category?.Trim() ?? "";
    string image = input.Image?.Trim() ?? "";
    string description = input.Description?.Trim() ?? "";

    if (string.IsNullOrWhiteSpace(name) ||
        string.IsNullOrWhiteSpace(category))
    {
        return Results.BadRequest(new
        {
            message = "Product name and category are required."
        });
    }

    if (name.Length > 150 || category.Length > 100)
    {
        return Results.BadRequest(new
        {
            message = "Product name or category is too long."
        });
    }

    if (input.Price <= 0 || input.Price > 1000000000)
    {
        return Results.BadRequest(new
        {
            message = "Price must be greater than zero and within the allowed limit."
        });
    }

    if (image.Length > 500 || !IsValidImageUrl(image))
    {
        return Results.BadRequest(new
        {
            message = "Image must be a valid URL or a local path beginning with /."
        });
    }

    if (description.Length > 2000)
    {
        return Results.BadRequest(new
        {
            message = "Description must not exceed 2000 characters."
        });
    }

    await db.OpenAsync();

    const string sql = @"
        INSERT INTO products
        (Name, Category, Price, Image, Description)
        VALUES
        (@name, @category, @price, @image, @description)";

    await using var command = new MySqlCommand(sql, db);

    command.Parameters.AddWithValue("@name", name);
    command.Parameters.AddWithValue("@category", category);
    command.Parameters.AddWithValue("@price", input.Price);
    command.Parameters.AddWithValue("@image", image);
    command.Parameters.AddWithValue("@description", description);

    await command.ExecuteNonQueryAsync();

    int id = Convert.ToInt32(command.LastInsertedId);

    var product = await GetProductAsync(db, id);

    return Results.Created($"/api/products/{id}", product);
}).RequireAuthorization("AdminOnly");

// UPDATE PRODUCT - ADMIN ONLY

app.MapPut("/api/products/{id:int}", async (
    int id,
    ProductInput input,
    MySqlConnection db) =>
{
    if (id <= 0)
    {
        return Results.BadRequest(new
        {
            message = "Product ID must be greater than zero."
        });
    }

    string name = input.Name?.Trim() ?? "";
    string category = input.Category?.Trim() ?? "";
    string image = input.Image?.Trim() ?? "";
    string description = input.Description?.Trim() ?? "";

    if (string.IsNullOrWhiteSpace(name) ||
        string.IsNullOrWhiteSpace(category))
    {
        return Results.BadRequest(new
        {
            message = "Product name and category are required."
        });
    }

    if (name.Length > 150 || category.Length > 100)
    {
        return Results.BadRequest(new
        {
            message = "Product name or category is too long."
        });
    }

    if (input.Price <= 0 || input.Price > 1000000000)
    {
        return Results.BadRequest(new
        {
            message = "Price must be greater than zero and within the allowed limit."
        });
    }

    if (image.Length > 500 || !IsValidImageUrl(image))
    {
        return Results.BadRequest(new
        {
            message = "Image must be a valid URL or a local path beginning with /."
        });
    }

    if (description.Length > 2000)
    {
        return Results.BadRequest(new
        {
            message = "Description must not exceed 2000 characters."
        });
    }

    await db.OpenAsync();

    var existing = await GetProductAsync(db, id);

    if (existing == null)
    {
        return Results.NotFound(new
        {
            message = "Product not found."
        });
    }

    const string sql = @"
        UPDATE products
        SET Name = @name,
            Category = @category,
            Price = @price,
            Image = @image,
            Description = @description
        WHERE Id = @id";

    await using var command = new MySqlCommand(sql, db);

    command.Parameters.AddWithValue("@id", id);
    command.Parameters.AddWithValue("@name", name);
    command.Parameters.AddWithValue("@category", category);
    command.Parameters.AddWithValue("@price", input.Price);
    command.Parameters.AddWithValue("@image", image);
    command.Parameters.AddWithValue("@description", description);

    await command.ExecuteNonQueryAsync();

    return Results.Ok(await GetProductAsync(db, id));
}).RequireAuthorization("AdminOnly");

// DELETE PRODUCT - ADMIN ONLY

app.MapDelete("/api/products/{id:int}", async (
    int id,
    MySqlConnection db) =>
{
    if (id <= 0)
    {
        return Results.BadRequest(new
        {
            message = "Product ID must be greater than zero."
        });
    }

    await db.OpenAsync();

    const string sql = "DELETE FROM products WHERE Id = @id";

    await using var command = new MySqlCommand(sql, db);
    command.Parameters.AddWithValue("@id", id);

    try
    {
        int affected = await command.ExecuteNonQueryAsync();

        if (affected == 0)
        {
            return Results.NotFound(new
            {
                message = "Product not found."
            });
        }

        return Results.Ok(new
        {
            message = "Product deleted successfully."
        });
    }
    catch (MySqlException ex) when (ex.Number == 1451)
    {
        return Results.Conflict(new
        {
            message = "This product is already used in an order and cannot be deleted."
        });
    }
}).RequireAuthorization("AdminOnly");

// ===================================
// CLIENTS
// ===================================

// GET ALL CLIENTS - ADMIN ONLY

app.MapGet("/api/clients", async (MySqlConnection db) =>
{
    await db.OpenAsync();

    const string sql = @"
        SELECT Id, FullName, Email, Phone, Address, CreatedAt
        FROM users
        WHERE Role = 'Client'
        ORDER BY Id DESC";

    var clients = new List<Client>();

    await using var command = new MySqlCommand(sql, db);
    await using var reader = await command.ExecuteReaderAsync();

    while (await reader.ReadAsync())
    {
        clients.Add(new Client
        {
            Id = Convert.ToInt32(reader["Id"]),
            Name = reader["FullName"].ToString()!,
            Email = reader["Email"].ToString()!,
            Phone = reader["Phone"]?.ToString() ?? "",
            Address = reader["Address"]?.ToString() ?? ""
        });
    }

    return Results.Ok(clients);
}).RequireAuthorization("AdminOnly");

// GET ONE CLIENT - ADMIN OR THE CLIENT HIMSELF

app.MapGet("/api/clients/{id:int}", async (
    int id,
    ClaimsPrincipal user,
    MySqlConnection db) =>
{
    if (id <= 0)
    {
        return Results.BadRequest(new
        {
            message = "Client ID must be greater than zero."
        });
    }

    bool isAdmin = user.IsInRole("Admin");
    string? userId = user.FindFirstValue(ClaimTypes.NameIdentifier);

    if (!isAdmin && userId != id.ToString())
    {
        return Results.Forbid();
    }

    await db.OpenAsync();

    const string sql = @"
        SELECT Id, FullName, Email, Phone, Address
        FROM users
        WHERE Id = @id AND Role = 'Client'";

    await using var command = new MySqlCommand(sql, db);
    command.Parameters.AddWithValue("@id", id);

    await using var reader = await command.ExecuteReaderAsync();

    if (!await reader.ReadAsync())
    {
        return Results.NotFound(new
        {
            message = "Client not found."
        });
    }

    var client = new Client
    {
        Id = Convert.ToInt32(reader["Id"]),
        Name = reader["FullName"].ToString()!,
        Email = reader["Email"].ToString()!,
        Phone = reader["Phone"]?.ToString() ?? "",
        Address = reader["Address"]?.ToString() ?? ""
    };

    return Results.Ok(client);
}).RequireAuthorization();

// GUEST CHECKOUT - PUBLIC

app.MapPost("/api/clients", async (
    ClientInput input,
    MySqlConnection db) =>
{
    string name = input.Name?.Trim() ?? "";
    string phone = input.Phone?.Trim() ?? "";
    string address = input.Address?.Trim() ?? "";
    string providedEmail = input.Email?.Trim().ToLowerInvariant() ?? "";

    if (string.IsNullOrWhiteSpace(name) ||
        string.IsNullOrWhiteSpace(phone))
    {
        return Results.BadRequest(new
        {
            message = "Customer name and phone are required."
        });
    }

    if (name.Length < 2 || name.Length > 100)
    {
        return Results.BadRequest(new
        {
            message = "Customer name must contain between 2 and 100 characters."
        });
    }

    if (!IsValidAlgerianPhone(phone))
    {
        return Results.BadRequest(new
        {
            message = "Please enter a valid Algerian mobile number (05, 06 or 07)."
        });
    }

    if (address.Length > 250)
    {
        return Results.BadRequest(new
        {
            message = "Address must not exceed 250 characters."
        });
    }

    if (!string.IsNullOrWhiteSpace(providedEmail) &&
        (providedEmail.Length > 254 || !IsValidEmail(providedEmail)))
    {
        return Results.BadRequest(new
        {
            message = "Please enter a valid email address."
        });
    }

    await db.OpenAsync();

    string email = string.IsNullOrWhiteSpace(providedEmail)
        ? $"guest_{Guid.NewGuid():N}@handwork.local"
        : providedEmail;

    const string sql = @"
        INSERT INTO users
        (FullName, Email, Phone, Address, PasswordHash, Role)
        VALUES
        (@name, @email, @phone, @address, @passwordHash, 'Client')";

    await using var command = new MySqlCommand(sql, db);

    command.Parameters.AddWithValue("@name", name);
    command.Parameters.AddWithValue("@email", email);
    command.Parameters.AddWithValue("@phone", phone);
    command.Parameters.AddWithValue("@address", address);
    command.Parameters.AddWithValue("@passwordHash", "GUEST_NO_LOGIN");

    try
    {
        await command.ExecuteNonQueryAsync();

        int id = Convert.ToInt32(command.LastInsertedId);

        return Results.Created($"/api/clients/{id}", new
        {
            id,
            name,
            email,
            phone,
            address
        });
    }
    catch (MySqlException ex) when (ex.Number == 1062)
    {
        return Results.Conflict(new
        {
            message = "This email or phone number is already registered."
        });
    }
});

// ===================================
// ORDERS
// ===================================

// GET ALL ORDERS - ADMIN ONLY

app.MapGet("/api/orders", async (MySqlConnection db) =>
{
    await db.OpenAsync();

    var ids = new List<int>();

    await using (var command = new MySqlCommand(
        "SELECT Id FROM orders ORDER BY Id DESC",
        db))
    {
        await using var reader = await command.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            ids.Add(Convert.ToInt32(reader["Id"]));
        }
    }

    var orders = new List<CustomerOrder>();

    foreach (int id in ids)
    {
        var order = await GetOrderAsync(db, id);

        if (order != null)
            orders.Add(order);
    }

    return Results.Ok(orders);
}).RequireAuthorization("AdminOnly");

// GET ONE ORDER - ADMIN OR ORDER OWNER

app.MapGet("/api/orders/{id:int}", async (
    int id,
    ClaimsPrincipal user,
    MySqlConnection db) =>
{
    if (id <= 0)
    {
        return Results.BadRequest(new
        {
            message = "Order ID must be greater than zero."
        });
    }

    await db.OpenAsync();

    var order = await GetOrderAsync(db, id);

    if (order == null)
    {
        return Results.NotFound(new
        {
            message = "Order not found."
        });
    }

    bool isAdmin = user.IsInRole("Admin");
    string? userId = user.FindFirstValue(ClaimTypes.NameIdentifier);

    if (!isAdmin && userId != order.ClientId.ToString())
    {
        return Results.Forbid();
    }

    return Results.Ok(order);
}).RequireAuthorization();

// GET ORDERS FOR ONE CLIENT - ADMIN OR THAT CLIENT

app.MapGet("/api/clients/{clientId:int}/orders", async (
    int clientId,
    ClaimsPrincipal user,
    MySqlConnection db) =>
{
    if (clientId <= 0)
    {
        return Results.BadRequest(new
        {
            message = "Client ID must be greater than zero."
        });
    }

    bool isAdmin = user.IsInRole("Admin");
    string? userId = user.FindFirstValue(ClaimTypes.NameIdentifier);

    if (!isAdmin && userId != clientId.ToString())
    {
        return Results.Forbid();
    }

    await db.OpenAsync();

    await using (var check = new MySqlCommand(
        "SELECT COUNT(*) FROM users WHERE Id = @id AND Role = 'Client'",
        db))
    {
        check.Parameters.AddWithValue("@id", clientId);

        int exists = Convert.ToInt32(await check.ExecuteScalarAsync());

        if (exists == 0)
        {
            return Results.NotFound(new
            {
                message = "Client not found."
            });
        }
    }

    var ids = new List<int>();

    await using (var command = new MySqlCommand(
        "SELECT Id FROM orders WHERE ClientId = @id ORDER BY Id DESC",
        db))
    {
        command.Parameters.AddWithValue("@id", clientId);

        await using var reader = await command.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            ids.Add(Convert.ToInt32(reader["Id"]));
        }
    }

    var orders = new List<CustomerOrder>();

    foreach (int id in ids)
    {
        var order = await GetOrderAsync(db, id);

        if (order != null)
            orders.Add(order);
    }

    return Results.Ok(orders);
}).RequireAuthorization();

// CREATE ORDER - AUTHENTICATED CLIENT OR GUEST

app.MapPost("/api/orders", async (
    CreateOrderInput input,
    ClaimsPrincipal user,
    MySqlConnection db) =>
{
    if (input.ClientId <= 0)
    {
        return Results.BadRequest(new
        {
            message = "A valid customer ID is required."
        });
    }

    if (input.Items == null || input.Items.Count == 0)
    {
        return Results.BadRequest(new
        {
            message = "The order must contain at least one product."
        });
    }

    if (input.Items.Count > 50)
    {
        return Results.BadRequest(new
        {
            message = "An order cannot contain more than 50 product entries."
        });
    }

    if (input.Items.Any(item => item.ProductId <= 0))
    {
        return Results.BadRequest(new
        {
            message = "Every product must have a valid product ID."
        });
    }

    if (input.Items.Any(item => item.Quantity <= 0 || item.Quantity > 100))
    {
        return Results.BadRequest(new
        {
            message = "Product quantity must be between 1 and 100."
        });
    }

    if (input.Items.Select(item => item.ProductId).Distinct().Count()
        != input.Items.Count)
    {
        return Results.BadRequest(new
        {
            message = "The same product cannot appear more than once in an order."
        });
    }

    await db.OpenAsync();

    await using var transaction = await db.BeginTransactionAsync();

    try
    {
        // Check client and permissions

        const string clientSql = @"
            SELECT Id, PasswordHash
            FROM users
            WHERE Id = @id AND Role = 'Client'";

        string? clientPasswordHash = null;

        await using (var command = new MySqlCommand(
            clientSql, db, transaction))
        {
            command.Parameters.AddWithValue("@id", input.ClientId);

            await using var reader = await command.ExecuteReaderAsync();

            if (await reader.ReadAsync())
            {
                clientPasswordHash = reader["PasswordHash"].ToString();
            }
        }

        if (clientPasswordHash == null)
        {
            await transaction.RollbackAsync();

            return Results.BadRequest(new
            {
                message = "Customer not found."
            });
        }

        bool isAuthenticated = user.Identity?.IsAuthenticated == true;
        bool isAdmin = user.IsInRole("Admin");

        string? authenticatedUserId =
            user.FindFirstValue(ClaimTypes.NameIdentifier);

        if (isAuthenticated)
        {
            if (!isAdmin &&
                authenticatedUserId != input.ClientId.ToString())
            {
                await transaction.RollbackAsync();
                return Results.Forbid();
            }
        }
        else
        {
            if (clientPasswordHash != "GUEST_NO_LOGIN")
            {
                await transaction.RollbackAsync();

                return Results.Unauthorized();
            }
        }

        var orderItems = new List<OrderItem>();

        // Get products and calculate subtotals

        foreach (var item in input.Items)
        {
            const string productSql = @"
                SELECT Id, Name, Price
                FROM products
                WHERE Id = @id";

            await using var productCommand = new MySqlCommand(
                productSql, db, transaction);

            productCommand.Parameters.AddWithValue("@id", item.ProductId);

            int productId;
            string productName;
            decimal price;

            await using (var reader =
                await productCommand.ExecuteReaderAsync())
            {
                if (!await reader.ReadAsync())
                {
                    await transaction.RollbackAsync();

                    return Results.BadRequest(new
                    {
                        message = $"Product with ID {item.ProductId} was not found."
                    });
                }

                productId = Convert.ToInt32(reader["Id"]);
                productName = reader["Name"].ToString()!;
                price = Convert.ToDecimal(reader["Price"]);
            }

            decimal subtotal;

            try
            {
                subtotal = checked(price * item.Quantity);
            }
            catch (OverflowException)
            {
                await transaction.RollbackAsync();

                return Results.BadRequest(new
                {
                    message = "The order total is too large."
                });
            }

            orderItems.Add(new OrderItem
            {
                ProductId = productId,
                ProductName = productName,
                UnitPrice = price,
                Quantity = item.Quantity,
                Subtotal = subtotal
            });
        }

        decimal total;

        try
        {
            total = orderItems.Sum(x => x.Subtotal);
        }
        catch (OverflowException)
        {
            await transaction.RollbackAsync();

            return Results.BadRequest(new
            {
                message = "The order total is too large."
            });
        }

        // Insert order

        const string orderSql = @"
            INSERT INTO orders
            (ClientId, TotalAmount, Status)
            VALUES
            (@clientId, @total, 'Pending')";

        await using var orderCommand = new MySqlCommand(
            orderSql, db, transaction);

        orderCommand.Parameters.AddWithValue("@clientId", input.ClientId);
        orderCommand.Parameters.AddWithValue("@total", total);

        await orderCommand.ExecuteNonQueryAsync();

        int orderId = Convert.ToInt32(orderCommand.LastInsertedId);

        // Insert order items

        foreach (var item in orderItems)
        {
            const string itemSql = @"
                INSERT INTO orderitems
                (OrderId, ProductId, ProductName, Quantity, UnitPrice, Subtotal)
                VALUES
                (@orderId, @productId, @productName, @quantity, @unitPrice, @subtotal)";

            await using var itemCommand = new MySqlCommand(
                itemSql, db, transaction);

            itemCommand.Parameters.AddWithValue("@orderId", orderId);
            itemCommand.Parameters.AddWithValue("@productId", item.ProductId);
            itemCommand.Parameters.AddWithValue("@productName", item.ProductName);
            itemCommand.Parameters.AddWithValue("@quantity", item.Quantity);
            itemCommand.Parameters.AddWithValue("@unitPrice", item.UnitPrice);
            itemCommand.Parameters.AddWithValue("@subtotal", item.Subtotal);

            await itemCommand.ExecuteNonQueryAsync();
        }
       // Create notification for admin

const string notificationSql = @"
    INSERT INTO Notifications
    (Type, Title, Message, IsRead, OrderId)
    VALUES
    (@type, @title, @message, FALSE, @orderId)";

await using var notificationCommand = new MySqlCommand(
    notificationSql, db, transaction);

notificationCommand.Parameters.AddWithValue("@type", "Order");
notificationCommand.Parameters.AddWithValue(
    "@title", "New Order Received");

notificationCommand.Parameters.AddWithValue(
    "@message",
    $"A new order #{orderId} has been received. Total: {total} DA.");

notificationCommand.Parameters.AddWithValue("@orderId", orderId);

await notificationCommand.ExecuteNonQueryAsync();
        await transaction.CommitAsync();

        var order = await GetOrderAsync(db, orderId);

        return Results.Created($"/api/orders/{orderId}", order);
    }
    catch
    {
        await transaction.RollbackAsync();
        throw;
    }
});

// UPDATE ORDER STATUS - ADMIN ONLY

app.MapPut("/api/orders/{id:int}/status", async (
    int id,
    UpdateOrderStatusInput input,
    MySqlConnection db) =>
{
    if (id <= 0)
    {
        return Results.BadRequest(new
        {
            message = "Order ID must be greater than zero."
        });
    }

    var allowedStatuses = new[]
    {
        "Pending",
        "Confirmed",
        "Preparing",
        "Shipped",
        "Completed",
        "Cancelled"
    };

    var status = allowedStatuses.FirstOrDefault(
        s => string.Equals(
            s,
            input.Status?.Trim(),
            StringComparison.OrdinalIgnoreCase
        )
    );

    if (status == null)
    {
        return Results.BadRequest(new
        {
            message = "Invalid order status."
        });
    }

    await db.OpenAsync();

    const string sql = @"
        UPDATE orders
        SET Status = @status
        WHERE Id = @id";

    await using var command = new MySqlCommand(sql, db);

    command.Parameters.AddWithValue("@id", id);
    command.Parameters.AddWithValue("@status", status);

    int affected = await command.ExecuteNonQueryAsync();

    if (affected == 0)
    {
        return Results.NotFound(new
        {
            message = "Order not found."
        });
    }

    return Results.Ok(await GetOrderAsync(db, id));
}).RequireAuthorization("AdminOnly");

// ===================================
// CONTACT MESSAGES
// ===================================

// SAVE MESSAGE - PUBLIC


app.MapPost("/api/messages", async (
    ContactMessageInput input,
    MySqlConnection db) =>
{
    string name = input.Name?.Trim() ?? "";
    string email = input.Email?.Trim().ToLowerInvariant() ?? "";
    string message = input.Message?.Trim() ?? "";

    // VALIDATION
    if (string.IsNullOrWhiteSpace(name) ||
        string.IsNullOrWhiteSpace(email) ||
        string.IsNullOrWhiteSpace(message))
    {
        return Results.BadRequest(new
        {
            message = "Name, email and message are required."
        });
    }

    if (name.Length < 2 || name.Length > 100)
    {
        return Results.BadRequest(new
        {
            message = "Name must contain between 2 and 100 characters."
        });
    }

    if (email.Length > 254 || !IsValidEmail(email))
    {
        return Results.BadRequest(new
        {
            message = "Please enter a valid email address."
        });
    }

    if (message.Length < 5 || message.Length > 3000)
    {
        return Results.BadRequest(new
        {
            message = "Message must contain between 5 and 3000 characters."
        });
    }

    await db.OpenAsync();

    await using var transaction = await db.BeginTransactionAsync();

    try
    {
        // 1. SAVE CONTACT MESSAGE
        const string messageSql = @"
            INSERT INTO contactmessages
            (Name, Email, Message)
            VALUES
            (@name, @email, @message)";

        await using var messageCommand = new MySqlCommand(
            messageSql, db, transaction);

        messageCommand.Parameters.AddWithValue("@name", name);
        messageCommand.Parameters.AddWithValue("@email", email);
        messageCommand.Parameters.AddWithValue("@message", message);

        await messageCommand.ExecuteNonQueryAsync();

        int messageId = Convert.ToInt32(messageCommand.LastInsertedId);


        // 2. CREATE ADMIN NOTIFICATION
        const string notificationSql = @"
            INSERT INTO Notifications
            (Type, Title, Message, IsRead, ContactMessageId)
            VALUES
            (@type, @title, @message, FALSE, @contactMessageId)";

        await using var notificationCommand = new MySqlCommand(
            notificationSql, db, transaction);

        notificationCommand.Parameters.AddWithValue("@type", "Message");
        notificationCommand.Parameters.AddWithValue(
            "@title", "New Contact Message");

        notificationCommand.Parameters.AddWithValue(
            "@message", $"New message received from {name} ({email}).");

        notificationCommand.Parameters.AddWithValue(
            "@contactMessageId", messageId);

        await notificationCommand.ExecuteNonQueryAsync();


        // 3. COMMIT BOTH OPERATIONS
        await transaction.CommitAsync();

        return Results.Created($"/api/messages/{messageId}", new
        {
            message = "Your message was received successfully.",
            id = messageId
        });
    }
    catch
    {
        await transaction.RollbackAsync();
        throw;
    }

}).RequireAuthorization("ClientOnly");


// GET MESSAGES - ADMIN ONLY

app.MapGet("/api/messages", async (MySqlConnection db) =>
{
    await db.OpenAsync();

    const string sql = @"
        SELECT Id, Name, Email, Subject, Message, CreatedAt
        FROM contactmessages
        ORDER BY Id DESC";

    var messages = new List<ContactMessage>();

    await using var command = new MySqlCommand(sql, db);
    await using var reader = await command.ExecuteReaderAsync();

    while (await reader.ReadAsync())
    {
        messages.Add(new ContactMessage
        {
            Id = Convert.ToInt32(reader["Id"]),
            Name = reader["Name"].ToString()!,
            Email = reader["Email"].ToString()!,
            Subject = reader["Subject"]?.ToString() ?? "",
            Message = reader["Message"].ToString()!,
            CreatedAt = Convert.ToDateTime(reader["CreatedAt"])
        });
    }

    return Results.Ok(messages);
}).RequireAuthorization("AdminOnly");

// ===================================
// NOTIFICATIONS
// ===================================

// GET ALL NOTIFICATIONS (ADMIN)

app.MapGet("/api/notifications", async (MySqlConnection db) =>
{
    await db.OpenAsync();

    const string sql = @"
        SELECT
            Id,
            Type,
            Title,
            Message,
            IsRead,
            OrderId,
            ContactMessageId,
            CreatedAt
        FROM Notifications
        ORDER BY CreatedAt DESC";

    var notifications = new List<Notification>();

    await using var command = new MySqlCommand(sql, db);
    await using var reader = await command.ExecuteReaderAsync();

    while (await reader.ReadAsync())
    {
        notifications.Add(new Notification
        {
            Id = Convert.ToInt32(reader["Id"]),
            Type = reader["Type"].ToString()!,
            Title = reader["Title"].ToString()!,
            Message = reader["Message"].ToString()!,
            IsRead = Convert.ToBoolean(reader["IsRead"]),

            OrderId = reader["OrderId"] == DBNull.Value
                ? null
                : Convert.ToInt32(reader["OrderId"]),

            ContactMessageId = reader["ContactMessageId"] == DBNull.Value
                ? null
                : Convert.ToInt32(reader["ContactMessageId"]),

            CreatedAt = Convert.ToDateTime(reader["CreatedAt"])
        });
    }

    return Results.Ok(notifications);

}).RequireAuthorization("AdminOnly");


// MARK NOTIFICATION AS READ (ADMIN)

app.MapPut("/api/notifications/{id}/read", async (
    int id,
    MySqlConnection db) =>
{
    await db.OpenAsync();

    const string sql = @"
        UPDATE Notifications
        SET IsRead = TRUE
        WHERE Id = @id";

    await using var command = new MySqlCommand(sql, db);
    command.Parameters.AddWithValue("@id", id);

    int rowsAffected = await command.ExecuteNonQueryAsync();

    if (rowsAffected == 0)
    {
        return Results.NotFound(new
        {
            message = "Notification not found."
        });
    }

    return Results.Ok(new
    {
        message = "Notification marked as read."
    });

}).RequireAuthorization("AdminOnly");
// ===================================
// RUN APPLICATION
// ===================================


// ===================================
// UPLOAD PRODUCT IMAGE
// ===================================

app.MapPost("/api/products/upload-image", async (
    HttpRequest request,
    IWebHostEnvironment environment) =>
{
    if (!request.HasFormContentType)
    {
        return Results.BadRequest(new
        {
            message = "Please upload an image using multipart/form-data."
        });
    }

    var form = await request.ReadFormAsync();

    var file = form.Files.GetFile("file");

    if (file == null || file.Length == 0)
    {
        return Results.BadRequest(new
        {
            message = "Please select an image."
        });
    }

    // Maximum size: 5 MB
    if (file.Length > 5 * 1024 * 1024)
    {
        return Results.BadRequest(new
        {
            message = "Image size must not exceed 5 MB."
        });
    }

    var allowedExtensions = new[]
    {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp"
    };

    var extension = Path.GetExtension(file.FileName)
        .ToLowerInvariant();

    if (!allowedExtensions.Contains(extension))
    {
        return Results.BadRequest(new
        {
            message = "Only JPG, JPEG, PNG and WEBP images are allowed."
        });
    }

    var uploadsFolder = Path.Combine(
        environment.ContentRootPath,
        "wwwroot",
        "uploads",
        "products"
    );

    Directory.CreateDirectory(uploadsFolder);

    // Generate a unique filename
    var fileName = $"{Guid.NewGuid()}{extension}";

    var filePath = Path.Combine(uploadsFolder, fileName);

    await using (var stream = new FileStream(filePath, FileMode.Create))
    {
        await file.CopyToAsync(stream);
    }

    var imageUrl =
        $"{request.Scheme}://{request.Host}/uploads/products/{fileName}";

    return Results.Ok(new
    {
        message = "Image uploaded successfully.",
        imageUrl = imageUrl
    });

})
.RequireAuthorization("AdminOnly");
app.Run();
// ===================================
// VALIDATION HELPER METHODS
// ===================================

static bool IsValidEmail(string email)
{
    return System.Net.Mail.MailAddress.TryCreate(
        email,
        out var mailAddress
    ) && mailAddress.Address == email;
}

static bool IsValidAlgerianPhone(string phone)
{
    return System.Text.RegularExpressions.Regex.IsMatch(
        phone,
        @"^0[567][0-9]{8}$"
    );
}

static bool IsValidImageUrl(string image)
{
    if (string.IsNullOrWhiteSpace(image))
        return true;

    // Allow local image paths such as /images/product.jpg

    if (image.StartsWith("/") && !image.StartsWith("//"))
        return true;

    // Allow absolute HTTP or HTTPS URLs

    return Uri.TryCreate(image, UriKind.Absolute, out var uri)
        && (uri.Scheme == Uri.UriSchemeHttp ||
            uri.Scheme == Uri.UriSchemeHttps);
}

// ===================================
// DATABASE HELPER METHODS
// ===================================

static async Task<Product?> GetProductAsync(
    MySqlConnection db,
    int id)
{
    const string sql = @"
        SELECT Id, Name, Category, Price, Image, Description
        FROM products
        WHERE Id = @id";

    await using var command = new MySqlCommand(sql, db);
    command.Parameters.AddWithValue("@id", id);

    await using var reader = await command.ExecuteReaderAsync();

    if (!await reader.ReadAsync())
        return null;

    return new Product
    {
        Id = Convert.ToInt32(reader["Id"]),
        Name = reader["Name"].ToString()!,
        Category = reader["Category"].ToString()!,
        Price = Convert.ToDecimal(reader["Price"]),
        Image = reader["Image"]?.ToString() ?? "",
        Description = reader["Description"]?.ToString() ?? ""
    };
}

static async Task<CustomerOrder?> GetOrderAsync(
    MySqlConnection db,
    int id)
{
    const string sql = @"
        SELECT
            o.Id,
            o.ClientId,
            o.TotalAmount,
            o.Status,
            o.OrderDate,
            u.FullName,
            u.Phone
        FROM orders o
        INNER JOIN users u ON o.ClientId = u.Id
        WHERE o.Id = @id";

    int clientId;
    string clientName;
    string clientPhone;
    decimal total;
    string status;
    DateTime createdAt;

    await using (var command = new MySqlCommand(sql, db))
    {
        command.Parameters.AddWithValue("@id", id);

        await using var reader = await command.ExecuteReaderAsync();

        if (!await reader.ReadAsync())
            return null;

        clientId = Convert.ToInt32(reader["ClientId"]);
        clientName = reader["FullName"].ToString()!;
        clientPhone = reader["Phone"]?.ToString() ?? "";
        total = Convert.ToDecimal(reader["TotalAmount"]);
        status = reader["Status"]?.ToString() ?? "Pending";

        createdAt = reader["OrderDate"] == DBNull.Value
            ? DateTime.MinValue
            : Convert.ToDateTime(reader["OrderDate"]);
    }

    var items = new List<OrderItem>();

    const string itemsSql = @"
        SELECT ProductId, ProductName, UnitPrice, Quantity, Subtotal
        FROM orderitems
        WHERE OrderId = @id";

    await using (var command = new MySqlCommand(itemsSql, db))
    {
        command.Parameters.AddWithValue("@id", id);

        await using var reader = await command.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            items.Add(new OrderItem
            {
                ProductId = Convert.ToInt32(reader["ProductId"]),
                ProductName = reader["ProductName"].ToString()!,
                UnitPrice = Convert.ToDecimal(reader["UnitPrice"]),
                Quantity = Convert.ToInt32(reader["Quantity"]),
                Subtotal = Convert.ToDecimal(reader["Subtotal"])
            });
        }
    }

    return new CustomerOrder
    {
        Id = id,
        ClientId = clientId,
        ClientName = clientName,
        ClientPhone = clientPhone,
        Items = items,
        Total = total,
        Status = status,
        CreatedAt = createdAt
    };
}

// ===================================
// MODELS
// ===================================

// REGISTER MODEL

public class RegisterRequest
{
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public string? Address { get; set; }
    public string Password { get; set; } = "";
}

// LOGIN MODEL

public class LoginRequest
{
    public string Phone { get; set; } = "";
    public string Password { get; set; } = "";
}

// PRODUCT MODELS

public class Product
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Category { get; set; } = "";
    public decimal Price { get; set; }
    public string Image { get; set; } = "";
    public string Description { get; set; } = "";
}

public class ProductInput
{
    public string Name { get; set; } = "";
    public string Category { get; set; } = "";
    public decimal Price { get; set; }
    public string? Image { get; set; }
    public string? Description { get; set; }
}

// CLIENT MODEL

public class Client
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Address { get; set; } = "";
}

public class ClientInput
{
    public string Name { get; set; } = "";
    public string Phone { get; set; } = "";
    public string? Email { get; set; }
    public string? Address { get; set; }
}

// ORDER MODELS

public class CustomerOrder
{
    public int Id { get; set; }
    public int ClientId { get; set; }
    public string ClientName { get; set; } = "";
    public string ClientPhone { get; set; } = "";
    public List<OrderItem> Items { get; set; } = new();
    public decimal Total { get; set; }
    public string Status { get; set; } = "Pending";
    public DateTime CreatedAt { get; set; }
}

public class OrderItem
{
    public int ProductId { get; set; }
    public string ProductName { get; set; } = "";
    public decimal UnitPrice { get; set; }
    public int Quantity { get; set; }
    public decimal Subtotal { get; set; }
}

public class CreateOrderInput
{
    public int ClientId { get; set; }
    public string? CustomerMessage { get; set; }
    public List<CreateOrderItemInput> Items { get; set; } = new();
}

public class CreateOrderItemInput
{
    public int ProductId { get; set; }
    public int Quantity { get; set; }
}

public class UpdateOrderStatusInput
{
    public string? Status { get; set; }
}

// CONTACT MESSAGE MODELS

public class ContactMessage
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Subject { get; set; } = "";
    public string Message { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}

public class ContactMessageInput
{
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Message { get; set; } = "";
}
// NOTIFICATION MODEL

public class Notification
{
    public int Id { get; set; }
    public string Type { get; set; } = "";
    public string Title { get; set; } = "";
    public string Message { get; set; } = "";
    public bool IsRead { get; set; }
    public int? OrderId { get; set; }
    public int? ContactMessageId { get; set; }
    public DateTime CreatedAt { get; set; }
}
