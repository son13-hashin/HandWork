using MySqlConnector;

public static class Database
{
    public static string ConnectionString { get; set; } = "";

    public static MySqlConnection CreateConnection()
    {
        return new MySqlConnection(ConnectionString);
    }

    public static async Task InitializeAsync()
    {
        await using var connection = CreateConnection();
        await connection.OpenAsync();

        var command = new MySqlCommand(
            "SELECT COUNT(*) FROM products",
            connection
        );

        var count = Convert.ToInt32(
            await command.ExecuteScalarAsync()
        );

        if (count > 0)
            return;

        var products = new[]
        {
            new ProductSeed("Graduation Gifts", "Graduation", 1500, "/images/gradd.jpg", "Beautiful gifts to celebrate graduation."),
            new ProductSeed("Graduation Box", "Graduation", 2500, "/images/graddd.jpg", "Elegant personalized graduation gift box."),
            new ProductSeed("Graduation Cap Gift", "Graduation", 1800, "/images/gradt.jpg", "A special gift inspired by graduation."),
            new ProductSeed("Graduation Souvenirs", "Graduation", 1200, "/images/gradtt.jpg", "Beautiful souvenirs for graduation celebrations."),

            new ProductSeed("Girly Stickers", "Stickers", 500, "/images/stic.jpg", "Personalized stickers for your feminine era."),
            new ProductSeed("Anime Stickers", "Stickers", 400, "/images/stick.jpg", "Custom stickers with your favorite character."),
            new ProductSeed("Wedding Stickers", "Stickers", 600, "/images/sticker.jpg", "Elegant personalized wedding stickers."),
            new ProductSeed("Thank You Stickers", "Stickers", 450, "/images/stickr.jpg", "Cute thank you stickers for your gifts."),

            new ProductSeed("Bride Favors", "Wedding", 2000, "/images/wedinn.jpg", "Lovely handmade favors for weddings."),
            new ProductSeed("Bride To Be Box", "Wedding", 2800, "/images/wed.jpg", "A beautiful personalized bride to be box."),
            new ProductSeed("Wedding Souvenirs", "Wedding", 1500, "/images/weddin.jpg", "Special souvenirs for unforgettable wedding moments."),
            new ProductSeed("Bridal Gift Set", "Wedding", 3200, "/images/weding.jpg", "An elegant gift set for the bride."),

            new ProductSeed("Girly gift boxes", "Gift Boxes", 1800, "/images/boxess.jpg", "Personalized gift boxes made with love."),
            new ProductSeed("Winter Box", "Gift Boxes", 2500, "/images/box.jpg", "A special personalized box for birthdays."),
            new ProductSeed("Chocolate Gift Box", "Gift Boxes", 3000, "/images/boxx.jpg", "A lovely box filled with sweet surprises."),
            new ProductSeed("Men gift box", "Gift Boxes", 3500, "/images/boxing.jpg", "A personalized gift set for someone special.")
        };

        foreach (var product in products)
        {
            await using var insert = new MySqlCommand(
                @"INSERT INTO products
                  (Name, Category, Price, Image, Description)
                  VALUES
                  (@name, @category, @price, @image, @description)",
                connection
            );

            insert.Parameters.AddWithValue("@name", product.Name);
            insert.Parameters.AddWithValue("@category", product.Category);
            insert.Parameters.AddWithValue("@price", product.Price);
            insert.Parameters.AddWithValue("@image", product.Image);
            insert.Parameters.AddWithValue("@description", product.Description);

            await insert.ExecuteNonQueryAsync();
        }
    }

    private record ProductSeed(
        string Name,
        string Category,
        decimal Price,
        string Image,
        string Description
    );
}